import { env } from "../config/env";

/**
 * Transactional email through Brevo.
 *
 * This is the platform's first contact that reaches someone who isn't on the
 * site: a supervisor's verification decision, an escrow release, a booked
 * meeting. It goes through Brevo's REST API directly rather than their SDK —
 * one POST with a JSON body needs no dependency, and a dependency we don't add
 * is one nobody has to explain.
 *
 * Free tier is 300 emails a day, which is why only the events in EMAIL_WORTHY
 * (see packages/shared/src/delivery.ts) are sent at all. Without an API key
 * every send is a logged no-op, so local development never tries to mail
 * anyone and never fails because it couldn't.
 */

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const REQUEST_TIMEOUT_MS = 10000;

const configured = Boolean(env.BREVO_API_KEY);

if (!configured) {
  console.warn("[email] BREVO_API_KEY not set — transactional email is disabled");
}

export function isEmailConfigured(): boolean {
  return configured;
}

export interface EmailInput {
  to: string;
  toName?: string;
  subject: string;
  /** Plain-text body. The HTML version is generated from it. */
  text: string;
  /** Optional in-app path — rendered as a button and appended to the text. */
  link?: string;
  linkLabel?: string;
}

/** Escapes the four characters that would otherwise break out of the markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Wraps the message in a plain, table-free layout.
 *
 * Deliberately minimal: inline styles only, no external CSS or images, since
 * mail clients strip stylesheets and block remote images by default. Anything
 * fancier would look worse in more inboxes than it improves.
 */
function renderHtml(input: EmailInput): string {
  const safeText = escapeHtml(input.text).replace(/\n/g, "<br />");
  const button =
    input.link &&
    `<p style="margin:24px 0 0"><a href="${escapeHtml(input.link)}" style="background:#F5B400;border-radius:999px;color:#0c0a09;display:inline-block;font-weight:700;padding:12px 28px;text-decoration:none">${escapeHtml(input.linkLabel ?? "Open Buildora")}</a></p>`;

  return `<div style="background:#f5f5f4;padding:32px 16px">
  <div style="background:#ffffff;border-radius:16px;margin:0 auto;max-width:520px;padding:32px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1c1917">
    <p style="color:#a8a29e;font-size:12px;font-weight:700;letter-spacing:2px;margin:0 0 20px;text-transform:uppercase">Buildora</p>
    <h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(input.subject)}</h1>
    <p style="color:#44403c;font-size:15px;line-height:1.6;margin:0">${safeText}</p>
    ${button ?? ""}
    <p style="border-top:1px solid #e7e5e4;color:#a8a29e;font-size:12px;line-height:1.6;margin:28px 0 0;padding-top:16px">
      You're receiving this because of activity on your Buildora account.
      Turn these off any time in Account settings &rsaquo; Notifications.
    </p>
  </div>
</div>`;
}

/**
 * Sends one email. Never throws — mail is a side effect of work that already
 * succeeded, exactly like the notification bell it rides along with.
 * Returns whether it actually went out, which the tests use.
 */
export async function sendEmail(input: EmailInput): Promise<boolean> {
  if (!configured) return false;

  // An absolute URL is required in mail — a relative path has nothing to
  // resolve against once it's out of the browser.
  const absoluteLink = input.link?.startsWith("http")
    ? input.link
    : input.link
      ? `${env.WEB_BASE_URL}${input.link}`
      : undefined;

  const payload = {
    sender: { name: env.EMAIL_FROM_NAME, email: env.EMAIL_FROM_ADDRESS },
    to: [{ email: input.to, ...(input.toName ? { name: input.toName } : {}) }],
    subject: input.subject,
    textContent: absoluteLink ? `${input.text}\n\n${absoluteLink}` : input.text,
    htmlContent: renderHtml({ ...input, link: absoluteLink }),
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const res = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": env.BREVO_API_KEY!,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!res.ok) {
      // Brevo explains refusals in the body — worth logging, since the usual
      // cause is an unverified sender address rather than a bad key.
      console.error(`[email] Brevo refused (${res.status}):`, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] send failed:", err instanceof Error ? err.message : err);
    return false;
  }
}
