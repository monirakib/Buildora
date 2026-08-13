import nodemailer, { type Transporter } from "nodemailer";
import type { NotificationType } from "@buildora/shared";
import { env } from "../config/env";
import { LOGO_CID, LOGO_PNG } from "./email-logo";
import { renderEmail } from "./email-template";

/**
 * Transactional email over SMTP.
 *
 * This is the platform's first contact that reaches someone who isn't on the
 * site: a supervisor's verification decision, an escrow release, a booked
 * meeting. It goes out through an ordinary mailbox — Gmail by default — using
 * SMTP, the same protocol any mail client speaks. No email provider account,
 * no API key, nothing to sign up for beyond the address we already own.
 *
 * Authentication is an **app password**, not the account password: Google
 * stopped accepting the real one for SMTP in 2022. Generate a 16-character app
 * password under Google Account → Security → 2-Step Verification → App
 * passwords, and put it in SMTP_PASSWORD.
 *
 * Only the events in EMAIL_WORTHY (see packages/shared/src/delivery.ts) are
 * sent at all — see the note there on why not everything deserves a mailbox.
 * Without SMTP_USER and SMTP_PASSWORD every send is a logged no-op, so local
 * development never tries to mail anyone and never fails because it couldn't.
 *
 * What the message actually looks like lives in email-template.ts.
 */

const configured = Boolean(env.SMTP_USER && env.SMTP_PASSWORD);

if (!configured) {
  console.warn("[email] SMTP_USER / SMTP_PASSWORD not set — transactional email is disabled");
}

export function isEmailConfigured(): boolean {
  return configured;
}

/**
 * The address in the From line.
 *
 * With Gmail this has to be the account that authenticated (or one of its
 * verified aliases). Anything else and Gmail quietly rewrites the header to the
 * real account, which looks broken to the recipient — so defaulting to
 * SMTP_USER is both the safe choice and the one that needs no configuration.
 */
const fromAddress = env.EMAIL_FROM_ADDRESS || env.SMTP_USER || "";

/**
 * One connection pool for the whole process, built on first use.
 *
 * Built lazily rather than at import time so that a server with no mail
 * configured never opens a socket, and so a bad password fails on the send
 * (where the error is visible and swallowed safely) instead of at boot.
 */
let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      // Port 465 is TLS from the first byte; 587 starts plain and upgrades with
      // STARTTLS. Both are encrypted — they just negotiate it at different
      // moments, and `secure` is what tells nodemailer which one this is.
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: env.SMTP_USER!,
        // Google shows app passwords as four groups of four ("abcd efgh ijkl
        // mnop") and people paste them exactly like that, spaces included. The
        // spaces are display only; leaving them in is a guaranteed 535.
        pass: env.SMTP_PASSWORD!.replace(/\s+/g, ""),
      },
      // A mail server that stops answering must not hold a request open.
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
  }
  return transporter;
}

export interface EmailInput {
  to: string;
  toName?: string;
  subject: string;
  /** Plain-text body. The HTML version is built from it. */
  text: string;
  /** In-app path or absolute URL — rendered as the button. */
  link?: string;
  linkLabel?: string;
  /** The kind of event, which colours the category pill in the template. */
  category?: NotificationType;
}

/**
 * Sends one email and throws if it didn't go.
 *
 * Used by the "send a test email" button, where the actual SMTP error ("Invalid
 * login: 535…") is exactly what the person setting this up needs to see. Every
 * other caller wants sendEmail below, which swallows the failure.
 */
export async function sendEmailOrThrow(input: EmailInput): Promise<void> {
  if (!configured) {
    throw new Error("Email isn't configured on this server");
  }

  // An absolute URL is required in mail — a relative path has nothing to
  // resolve against once it's out of the browser.
  const absoluteLink = input.link?.startsWith("http")
    ? input.link
    : input.link
      ? `${env.WEB_BASE_URL}${input.link}`
      : undefined;

  const { html, text } = renderEmail({
    subject: input.subject,
    text: input.text,
    recipientName: input.toName,
    link: absoluteLink,
    linkLabel: input.linkLabel,
    category: input.category,
    settingsUrl: `${env.WEB_BASE_URL}/account`,
  });

  await getTransporter().sendMail({
    from: { name: env.EMAIL_FROM_NAME, address: fromAddress },
    to: input.toName ? { name: input.toName, address: input.to } : input.to,
    subject: input.subject,
    text,
    html,
    attachments: [
      {
        // `cid` is what makes this an *inline* part rather than a download:
        // the template's <img src="cid:buildora-mark"> resolves to these bytes
        // inside the message, so the logo shows with no server to fetch from.
        filename: "buildora.png",
        content: LOGO_PNG,
        cid: LOGO_CID,
        contentType: "image/png",
      },
    ],
    headers: {
      // Standard header that puts a one-click "unsubscribe" control in Gmail's
      // own UI, pointed at our notification settings. Spam filters look for it
      // on bulk-ish mail, and honouring it is simply correct.
      "List-Unsubscribe": `<${env.WEB_BASE_URL}/account>`,
    },
  });
}

/**
 * Sends one email. Never throws — mail is a side effect of work that already
 * succeeded, exactly like the notification bell it rides along with.
 * Returns whether it actually went out, which the tests use.
 */
export async function sendEmail(input: EmailInput): Promise<boolean> {
  if (!configured) return false;
  try {
    await sendEmailOrThrow(input);
    return true;
  } catch (err) {
    // Worth logging in full: the usual causes are a stale app password or
    // Gmail's daily send cap, and both say so plainly in the SMTP reply.
    console.error("[email] send failed:", err instanceof Error ? err.message : err);
    return false;
  }
}
