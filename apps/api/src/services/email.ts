import nodemailer, { type Transporter } from "nodemailer";
import type { NotificationType } from "@buildora/shared";
import { env } from "../config/env";
import { LOGO_CID, LOGO_PNG } from "./email-logo";
import { renderEmail } from "./email-template";

/**
 * Transactional email: one message, three ways out.
 *
 * This is the platform's first contact that reaches someone who isn't on the
 * site: a supervisor's verification decision, an escrow release, a booked
 * meeting. How it leaves the building is a deployment detail, so every route
 * sits behind one `sendEmail`, and the first one configured wins:
 *
 *   Mailjet  Their REST API over HTTPS. The production route, because Render's
 *            free tier blocks outbound SMTP (ports 25, 465 and 587) outright —
 *            a deployed API can never open a mail connection at all, and only
 *            something on port 443 gets out. Free tier is 200 a day, and it
 *            needs no domain: one sender address, verified by clicking a link.
 *   Brevo    Same idea, 300 a day. Kept because we hold a key, but a new Brevo
 *            account can't send until they activate it by hand.
 *   SMTP     Gmail with an app password, straight from a mailbox we already
 *            own. No third-party account and nothing to activate, so it's the
 *            local path — and useless on Render, hence last. The app password
 *            is *not* the Google account password; Google stopped accepting
 *            that for SMTP in 2022.
 *
 * All three are called with plain fetch or nodemailer rather than a vendor
 * SDK. Each is one request with a JSON body, and a dependency we don't add is
 * one nobody has to explain.
 *
 * Whichever route runs, the mail comes from EMAIL_FROM_ADDRESS — which the two
 * APIs require to be a verified sender, and Gmail requires to be the account
 * that authenticated.
 *
 * Only the events in EMAIL_WORTHY (see packages/shared/src/delivery.ts) are
 * sent at all, and only to confirmed addresses (see emailVerification.ts).
 * With no route configured every send is a logged no-op, so a bare checkout
 * never tries to mail anyone and never fails because it couldn't.
 *
 * What the message actually looks like lives in email-template.ts.
 */

const MAILJET_ENDPOINT = "https://api.mailjet.com/v3.1/send";
const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const REQUEST_TIMEOUT_MS = 10000;

const mailjetConfigured = Boolean(env.MAILJET_API_KEY && env.MAILJET_API_SECRET);
const brevoConfigured = Boolean(env.BREVO_API_KEY);
const smtpConfigured = Boolean(env.SMTP_USER && env.SMTP_PASSWORD);
const configured = mailjetConfigured || brevoConfigured || smtpConfigured;

/** Names the live route, for the boot log and for the error messages. */
const route = mailjetConfigured
  ? "Mailjet"
  : brevoConfigured
    ? "Brevo"
    : smtpConfigured
      ? "Gmail SMTP"
      : "none";

if (!configured) {
  console.warn("[email] no mail route configured — transactional email is disabled");
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
  /** In-app path or absolute URL — rendered as the button. */
  link?: string;
  linkLabel?: string;
  /** The kind of event, which colours the category pill in the template. */
  category?: NotificationType;
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
    throw new Error(`EMAIL_FROM_ADDRESS isn't set — ${route} has no address to send from`);
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

  // The header that puts a one-click "unsubscribe" control in Gmail's own UI,
  // pointed at our notification settings. Spam filters look for it, and
  // honouring it is simply correct.
  const headers = { "List-Unsubscribe": `<${env.WEB_BASE_URL}/account>` };

  if (mailjetConfigured) {
    await sendViaMailjet(input, html, text, headers);
  } else if (brevoConfigured) {
    await sendViaBrevo(input, html, text, headers);
  } else {
    await sendViaSmtp(input, html, text, headers);
  }
}

/**
 * Posts the message to Mailjet's Send API.
 *
 * Two things to know about their responses. Authentication is HTTP Basic with
 * the key as username and the secret as password — not a bearer token or a
 * custom header. And a 200 does not mean it was accepted: Mailjet answers with
 * a per-message Status, so a refusal for this one message arrives inside a
 * successful HTTP response and has to be read out of the body.
 */
async function sendViaMailjet(
  input: EmailInput,
  html: string,
  text: string,
  headers: Record<string, string>
): Promise<void> {
  const credentials = Buffer.from(`${env.MAILJET_API_KEY}:${env.MAILJET_API_SECRET}`).toString(
    "base64"
  );

  const payload = {
    Messages: [
      {
        From: { Email: env.EMAIL_FROM_ADDRESS, Name: env.EMAIL_FROM_NAME },
        To: [{ Email: input.to, ...(input.toName ? { Name: input.toName } : {}) }],
        Subject: input.subject,
        TextPart: text,
        HTMLPart: html,
        Headers: headers,
        // "Inlined" is Mailjet's word for an attachment the HTML refers to by
        // Content-ID rather than one the reader downloads. ContentID matches
        // the template's <img src="cid:buildora.png">.
        InlinedAttachments: [
          {
            ContentType: "image/png",
            Filename: LOGO_CID,
            ContentID: LOGO_CID,
            Base64Content: LOGO_PNG.toString("base64"),
          },
        ],
      },
    ],
  };

  const res = await postJson(MAILJET_ENDPOINT, payload, {
    authorization: `Basic ${credentials}`,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Mailjet refused the message (${res.status}) ${detail}`.trim());
  }

  const body = (await res.json().catch(() => null)) as {
    Messages?: { Status?: string; Errors?: { ErrorMessage?: string }[] }[];
  } | null;
  const message = body?.Messages?.[0];
  if (message?.Status !== "success") {
    const why = message?.Errors?.map((e) => e.ErrorMessage).join("; ");
    throw new Error(`Mailjet rejected the message: ${why || JSON.stringify(body)}`);
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

/** Posts the message to Brevo's REST API. */
async function sendViaBrevo(
  input: EmailInput,
  html: string,
  text: string,
  headers: Record<string, string>
): Promise<void> {
  const payload = {
    sender: { name: env.EMAIL_FROM_NAME, email: env.EMAIL_FROM_ADDRESS },
    to: [{ email: input.to, ...(input.toName ? { name: input.toName } : {}) }],
    subject: input.subject,
    textContent: text,
    htmlContent: html,
    headers,
    // Brevo addresses an inline attachment by its filename, so this name and
    // the template's <img src="cid:buildora.png"> have to stay identical —
    // that pairing is exactly what LOGO_CID holds.
    attachment: [{ name: LOGO_CID, content: LOGO_PNG.toString("base64") }],
  };

  const res = await postJson(BREVO_ENDPOINT, payload, { "api-key": env.BREVO_API_KEY! });

  if (!res.ok) {
    // Brevo explains refusals in the body — worth passing on, since the causes
    // are all things a person has to go and fix in their dashboard: an
    // unverified sender, an unlisted IP, an account not yet activated.
    const detail = await res.text().catch(() => "");
    throw new Error(`Brevo refused the message (${res.status}) ${detail}`.trim());
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
