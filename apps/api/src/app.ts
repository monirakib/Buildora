import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { allowedOrigins } from "./config/origins";
import { REFRESH_HEADER } from "./middleware/csrf";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { rateLimit } from "./middleware/rateLimit";
import { apiRouter } from "./routes";

export function createApp() {
  const app = express();

  /**
   * In production this API sits behind Render's load balancer, so every request
   * arrives from the proxy's address and `req.ip` is that address for everyone.
   * Without this line the rate limiters keyed by IP — login, signup, the guest
   * assistant, the baseline below — would all share a single bucket for the
   * entire internet: ten failed logins from anyone would lock out everyone.
   *
   * `1` means "trust exactly one hop". It takes the last entry in
   * X-Forwarded-For, which the proxy sets itself, so a client can't pick its own
   * identity by sending the header. Trusting `true` instead would let anyone do
   * exactly that and walk straight through every limit.
   */
  app.set("trust proxy", 1);

  app.use(helmet());
  // The allowlist is a function rather than a string so more than one origin
  // can be permitted. `credentials: true` is what actually lets the browser
  // send and store the refresh cookie — and it is why the origin must be an
  // exact match and never "*": browsers refuse a wildcard on credentialed
  // requests, and rightly so.
  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header at all: curl, server-to-server, same-origin
        // navigation. There is no browser-held cookie to abuse in that case.
        if (!origin) return callback(null, true);
        return callback(null, allowedOrigins.includes(origin.replace(/\/$/, "")));
      },
      credentials: true,
      // Named explicitly so the preflight for a refresh call succeeds — and so
      // that it only succeeds for the origins above, which is what makes this
      // header usable as a CSRF guard.
      allowedHeaders: ["Content-Type", "Authorization", REFRESH_HEADER],
    })
  );
  // A fully drawn floor plan is by far the largest body this API accepts: at the
  // validator's own caps (400 walls, 400 openings, 300 pieces of furniture, 120
  // rooms) the JSON runs past 150 KB, which the 100 KB default would reject.
  app.use(express.json({ limit: "1mb" }));
  // Reads the refresh cookie on /api/auth/refresh and /api/auth/logout. Nothing
  // else in the app authenticates from a cookie.
  app.use(cookieParser());
  // SSLCommerz returns the payer to us with an ordinary HTML form POST, not
  // JSON — without this parser those callbacks arrive with an empty body and
  // every payment looks like it failed.
  app.use(express.urlencoded({ extended: false }));

  /**
   * A floor under everything.
   *
   * The specific limits live next to the routes that need them — login, the
   * model calls, uploads — because each has its own reason for the number it
   * picked. This one has no opinion about any endpoint; it just means that no
   * part of the API can be hit thousands of times a minute from one address,
   * including the parts nobody thought to limit.
   *
   * The ceiling is deliberately high. The web app polls (the inbox, the
   * notification bell) and a university lab shares one public IP, so a
   * conservative number here would lock out a room full of legitimate users —
   * and this is a flood stop, not a fairness mechanism.
   */
  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      max: 600,
      message: "Too many requests from this connection, slow down a moment",
    })
  );

  app.use("/api", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
