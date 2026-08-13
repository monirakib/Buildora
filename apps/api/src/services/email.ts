import nodemailer, { type Transporter } from "nodemailer";
import type { NotificationType } from "@buildora/shared";
import { env } from "../config/env";
import { LOGO_CID, LOGO_PNG } from "./email-logo";
import { renderEmail, type EmailHighlight } from "./email-template";

/**
 * Transactional email: one message, two ways out.
 *
 * This is the platform's first contact that reaches someone who isn't on the
 * site: a supervisor's verification decision, an escrow release, a booked
 * meeting. How it leaves the building is a deployment detail, so both routes
 * sit behind one `sendEmail`, and the first one configured wins:
 *
 *   Resend   Their REST API over HTTPS. The production route, because Render's
 *            free tier blocks outbound SMTP (ports 25, 465 and 587) outright —
 *            a deployed API can never open a mail connection at all, and only
 *            something on port 443 gets out. Free tier is 3,000 a month, and
 *            the price of entry is a domain they can verify by DNS rather than
 *            an account review: buildora.software, which also means the mail
 *            is DKIM-signed as us instead of as a stranger.
 *   SMTP     Gmail with an app password, straight from a mailbox we already
 *            own. No third-party account and nothing to configure elsewhere,
 *            so it's the local path — and useless on Render, hence last. The
 *            app password is *not* the Google account password; Google stopped
 *            accepting that for SMTP in 2022.
 *
 * Both are called with plain fetch or nodemailer rather than a vendor SDK.
 * Each is one request with a JSON body, and a dependency we don't add is one
 * nobody has to explain.
 *
 * Whichever route runs, the mail comes from EMAIL_FROM_ADDRESS — which Resend
 * requires to sit at a domain it has verified, and Gmail requires to be the
 * account that authenticated.
 *
 * Only the events in EMAIL_WORTHY (see packages/shared/src/delivery.ts) are
 * sent at all, and only to confirmed addresses (see emailVerification.ts).
 * With no route configured every send is a logged no-op, so a bare checkout
 * never tries to mail anyone and never fails because it couldn't.
 *
 * What the message actually looks like lives in email-template.ts.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const REQUEST_TIMEOUT_MS = 10000;

const resendConfigured = Boolean(env.RESEND_API_KEY);
const smtpConfigured = Boolean(env.SMTP_USER && env.SMTP_PASSWORD);
const configured = resendConfigured || smtpConfigured;

/** Names the live route, for the boot log and for the error messages. */
const route = resendConfigured ? "Resend" : smtpConfigured ? "Gmail SMTP" : "none";

if (!configured) {
  console.warn("[email] no mail route configured, transactional email is disabled");
} else {
  console.info(`[email] sending over ${route}`);
}

/**
 * One SMTP connection pool for the process, built on first use.
 *
 * Lazy rather than at import time so a deployment that sends over one of the
 * HTTP routes never opens a socket at all, and so a bad password fails on the
 * send — where the error is visible and already handled — not at boot.
 */
let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      // Port 465 is TLS from the first byte; 587 starts plain and upgrades
      // with STARTTLS. Both are encrypted — `secure` says which this is.
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: env.SMTP_USER!,
        // Google shows app passwords as four groups of four and people paste
        // them that way. The spaces are display only; leaving them in is a
        // guaranteed 535.
        pass: env.SMTP_PASSWORD!.replace(/\s+/g, ""),
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
  }
  return transporter;
}

export function isEmailConfigured(): boolean {
  return configured;
}

export interface EmailInput {
  to: string;
  toName?: string;
  subject: string;
  /** Plain-text body. The HTML version is built from it. */
  text: string;
  /** In-app path or absolute URL, rendered as the button. */
  link?: string;
  linkLabel?: string;
  /** A phrase inside the subject to pick out in amber in the headline. */
  accent?: string;
  /** Small print under the button, e.g. how long the link stays good. */
  meta?: string;
  /** The kind of event, which labels the category pill in the template. */
  category?: NotificationType;
  /** The three feature tiles. Only welcome-shaped mail should ask for them. */
  highlights?: EmailHighlight[];
}

/**
 * Sends one email and throws if it didn't go.
 *
 * Used by the "send a test email" button and by the verification link, where
 * the reason for a refusal is exactly what the person needs to see. Every
 * other caller wants sendEmail below, which swallows the failure.
 */
export async function sendEmailOrThrow(input: EmailInput): Promise<void> {
  if (!configured) {
    throw new Error("Email isn't configured on this server");
  }
  if (!env.EMAIL_FROM_ADDRESS) {
    throw new Error(`EMAIL_FROM_ADDRESS isn't set, ${route} has no address to send from`);
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
    accent: input.accent,
    meta: input.meta,
    category: input.category,
    highlights: input.highlights,
    settingsUrl: `${env.WEB_BASE_URL}/account`,
    homeUrl: env.WEB_BASE_URL,
  });

  // The header that puts a one-click "unsubscribe" control in Gmail's own UI,
  // pointed at our notification settings. Spam filters look for it, and
  // honouring it is simply correct.
  const headers = { "List-Unsubscribe": `<${env.WEB_BASE_URL}/account>` };

  if (resendConfigured) {
    await sendViaResend(input, html, text, headers);
  } else {
    await sendViaSmtp(input, html, text, headers);
  }
}

/**
 * One JSON POST with a deadline.
 *
 * fetch has no timeout of its own, so without the abort signal a mail API that
 * stopped answering would hold a request open until something else gave up.
 */
async function postJson(
  url: string,
  payload: unknown,
  extraHeaders: Record<string, string>
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", ...extraHeaders },
    body: JSON.stringify(payload),
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));
}

/** Posts the message to Resend's REST API. */
async function sendViaResend(
  input: EmailInput,
  html: string,
  text: string,
  headers: Record<string, string>
): Promise<void> {
  const payload = {
    // Resend takes the sender as one RFC 5322 string rather than a name/email
    // pair, so the display name is spliced in here.
    from: `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM_ADDRESS}>`,
    to: [input.toName ? `${input.toName} <${input.to}>` : input.to],
    subject: input.subject,
    text,
    html,
    headers,
    // content_id is what makes this inline rather than a download: it's the
    // other half of the template's <img src="cid:buildora.png">. Resend wants
    // the bytes base64-encoded in the JSON body.
    attachments: [
      {
        filename: LOGO_CID,
        content: LOGO_PNG.toString("base64"),
        content_id: LOGO_CID,
      },
    ],
  };

  const res = await postJson(RESEND_ENDPOINT, payload, {
    authorization: `Bearer ${env.RESEND_API_KEY}`,
  });

  if (!res.ok) {
    // Resend names the actual problem in the body, and the causes are all
    // things a person has to go and fix outside this code: a domain whose DNS
    // records haven't propagated, a From address at some other domain, a key
    // that was created read-only. Passing the text through is what makes the
    // "send a test email" button worth pressing.
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend refused the message (${res.status}) ${detail}`.trim());
  }
}

/** Hands the message to Gmail over SMTP. */
async function sendViaSmtp(
  input: EmailInput,
  html: string,
  text: string,
  headers: Record<string, string>
): Promise<void> {
  await getTransporter().sendMail({
    from: { name: env.EMAIL_FROM_NAME, address: env.EMAIL_FROM_ADDRESS! },
    to: input.toName ? { name: input.toName, address: input.to } : input.to,
    subject: input.subject,
    text,
    html,
    headers,
    attachments: [
      {
        // `cid` is what makes this inline rather than a download: the
        // template's <img src="cid:buildora.png"> resolves to these bytes
        // inside the message, with no server to fetch from.
        filename: LOGO_CID,
        content: LOGO_PNG,
        cid: LOGO_CID,
        contentType: "image/png",
      },
    ],
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
    console.error("[email] send failed:", err instanceof Error ? err.message : err);
    return false;
  }
}
