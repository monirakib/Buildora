/**
 * Access tokens, signed with Ed25519.
 *
 * These used to be HMAC-SHA256 (HS256), which is *symmetric*: the same secret
 * both signs and verifies, so every component that needs to check a token also
 * holds the power to mint one. Anything that can read a token can forge one
 * claiming `role: "ADMIN"`.
 *
 * Ed25519 splits that in two. The private key signs and never leaves this
 * process; the public key only verifies and is safe to publish — which it is,
 * at GET /api/auth/jwks. Nothing that merely checks a token can create one any
 * more. That is the property worth having, and it is the reason the algorithm
 * changed.
 *
 * **Why Ed25519 and not RSA.** Both give the same split. Ed25519 keys are 32
 * bytes against RSA-2048's ~256, signatures are 64 bytes against 256, and
 * signing is considerably faster — which matters on a shared-CPU free tier
 * where every authenticated request verifies one. It is also misuse-resistant
 * by construction: no padding mode to choose wrongly, and deterministic
 * signatures, so a weak random number generator cannot leak the private key the
 * way it can with ECDSA.
 *
 * **Why `jose` and not `jsonwebtoken`.** jsonwebtoken supports HS/RS/ES/PS and
 * has never supported EdDSA, so Ed25519 is not reachable from it at all. jose
 * also handles the `kid` header and JWKS natively, which is exactly the
 * machinery key rotation needs.
 */
import { SignJWT, exportJWK, importPKCS8, jwtVerify, type JWTPayload, type KeyObject } from "jose";
import { createPrivateKey, createPublicKey, generateKeyPairSync } from "node:crypto";
import type { UserRole } from "@buildora/shared";
import { env } from "../config/env";

/** What the token must claim to have been issued by this API, for this app. */
export const JWT_ISSUER = "buildora-api";
export const JWT_AUDIENCE = "buildora-web";
const ALGORITHM = "EdDSA";

export interface AccessTokenClaims {
  sub: string;
  role: UserRole;
  sid: string;
}

interface Keypair {
  kid: string;
  privateKey: KeyObject;
  publicKey: KeyObject;
}

/**
 * The signing keys, by id.
 *
 * In development a pair is generated at startup if none is configured, so the
 * app runs with no setup — at the cost of every token dying when the server
 * restarts, which in development is what you want anyway. In production a key
 * is required: generating one per boot would sign everyone out on every deploy,
 * and on a free tier that also happens every time the instance wakes up.
 */
function loadKeys(): Keypair[] {
  if (!env.JWT_KEYRING) {
    if (env.NODE_ENV === "production") {
      throw new Error(
        "JWT_KEYRING is required in production. Generate one with:\n" +
          `  node -e "const{generateKeyPairSync}=require('crypto');const{privateKey}=generateKeyPairSync('ed25519');console.log(JSON.stringify({k1:privateKey.export({type:'pkcs8',format:'pem'})}))"`
      );
    }
    console.warn(
      "[api] JWT_KEYRING is not set — generating a development signing key. " +
        "Every restart invalidates existing tokens."
    );
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    return [{ kid: "dev", privateKey: privateKey as KeyObject, publicKey: publicKey as KeyObject }];
  }

  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(env.JWT_KEYRING) as Record<string, string>;
  } catch {
    throw new Error('JWT_KEYRING must be JSON, e.g. {"k1":"-----BEGIN PRIVATE KEY-----..."}');
  }

  return Object.entries(parsed).map(([kid, pem]) => {
    const privateKey = createPrivateKey(pem);
    if (privateKey.asymmetricKeyType !== "ed25519") {
      throw new Error(`JWT_KEYRING["${kid}"] is ${privateKey.asymmetricKeyType}, expected ed25519`);
    }
    return {
      kid,
      privateKey: privateKey as KeyObject,
      publicKey: createPublicKey(privateKey) as KeyObject,
    };
  });
}

const keys = loadKeys();
const byKid = new Map(keys.map((k) => [k.kid, k]));
/** Newly minted tokens use the last key in the ring. */
const active = keys[keys.length - 1]!;

/** Signs an access token, naming its key in the header so rotation works. */
export async function signAccessToken(claims: AccessTokenClaims, ttlSeconds: number) {
  return new SignJWT({ role: claims.role, sid: claims.sid })
    .setProtectedHeader({ alg: ALGORITHM, kid: active.kid })
    .setSubject(claims.sub)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(active.privateKey);
}

/**
 * Verifies an access token, pinning everything that can be pinned.
 *
 * `algorithms` is the important one. Left open, a library will accept whatever
 * algorithm the token's own header names — and the token is attacker input, so
 * letting it choose how it is verified is letting it choose whether it is. The
 * classic result is a token that says `alg: none`, or one that says HS256 so
 * the *public* key gets used as an HMAC secret; since the public key is
 * published, anyone could then mint tokens. Naming the one algorithm we issue
 * closes both off.
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  const { payload, protectedHeader } = await jwtVerify(
    token,
    async (header) => {
      const key = header.kid ? byKid.get(header.kid) : undefined;
      if (!key) throw new Error(`Unknown key id ${header.kid}`);
      return key.publicKey;
    },
    { algorithms: [ALGORITHM], issuer: JWT_ISSUER, audience: JWT_AUDIENCE }
  );
  if (!protectedHeader.kid) throw new Error("Token has no key id");

  const claims = payload as JWTPayload & { role?: UserRole; sid?: string };
  if (!claims.sub || !claims.role || !claims.sid) throw new Error("Token is missing claims");
  return { sub: claims.sub, role: claims.role, sid: claims.sid };
}

/**
 * The public half of every key, in JWK Set form.
 *
 * Served publicly on purpose — this is what "asymmetric" buys, made visible.
 * Every key is listed, not just the active one, so a token signed before a
 * rotation still verifies until it expires.
 */
export async function publicJwks() {
  const jwks = await Promise.all(
    keys.map(async (key) => ({
      ...(await exportJWK(key.publicKey)),
      kid: key.kid,
      alg: ALGORITHM,
      use: "sig",
    }))
  );
  return { keys: jwks };
}
