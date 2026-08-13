import { NotificationType } from "@buildora/shared";
import { LOGO_CID } from "./email-logo";

/**
 * The look of every email Buildora sends.
 *
 * Kept apart from the sending code in email.ts so the design can be read (and
 * changed) without touching SMTP, and so one layout covers every event —
 * a verification decision, an escrow release, a booked meeting all arrive
 * looking like they came from the same platform.
 *
 * Email is not the web. Three rules shape everything below:
 *
 *   1. Layout is done with tables, not flexbox or grid. Outlook on Windows
 *      renders HTML with Word's engine, which has no support for either.
 *   2. Styles are inline on each element. Gmail strips <style> blocks in
 *      several of its clients, so anything structural has to survive without
 *      them. The one <style> we do send only carries progressive extras —
 *      the mobile tweaks and dark mode — which are fine to lose.
 *   3. No remote images and no web fonts. Most clients block images until the
 *      reader clicks "show images", so a logo picture would leave a hole in
 *      the header. The mark below is a coloured table cell with a letter in it,
 *      which always draws.
 */

/** Buildora's colours, in the plain hex that mail clients understand. */
const COLOR = {
  canvas: "#f1efec", // the page behind the card
  card: "#ffffff",
  header: "#1c1917", // dark band across the top
  brand: "#f5b400", // the amber used across the web app
  ink: "#1c1917", // headings
  body: "#44403c", // paragraphs
  muted: "#8a8580", // footer and small print
  hairline: "#e7e5e4",
};

/**
 * The coloured pill above the headline, so the reader knows what kind of thing
 * this is before reading a word of it.
 *
 * Only the events that can actually reach a mailbox are listed — EMAIL_WORTHY
 * in packages/shared/src/delivery.ts decides that. Anything missing simply
 * renders without a pill rather than breaking.
 */
const CATEGORY: Partial<Record<NotificationType, { label: string; bg: string; fg: string }>> = {
  [NotificationType.PAYMENT]: { label: "Payment", bg: "#dcfce7", fg: "#14532d" },
  [NotificationType.MILESTONE]: { label: "Milestone", bg: "#dcfce7", fg: "#14532d" },
  [NotificationType.VERIFICATION]: { label: "Verification", bg: "#fef3c7", fg: "#854d0e" },
  [NotificationType.MEETING]: { label: "Meeting", bg: "#dbeafe", fg: "#1e3a8a" },
  [NotificationType.PROPOSAL]: { label: "Proposal", bg: "#ffedd5", fg: "#9a3412" },
  [NotificationType.CONTRACT]: { label: "Contract", bg: "#ffedd5", fg: "#9a3412" },
  [NotificationType.ORDER]: { label: "Order", bg: "#ccfbf1", fg: "#115e59" },
  [NotificationType.TENDER]: { label: "Tender", bg: "#ede9fe", fg: "#5b21b6" },
  [NotificationType.BID]: { label: "Bid", bg: "#ede9fe", fg: "#5b21b6" },
  [NotificationType.SYSTEM]: { label: "Buildora", bg: "#e7e5e4", fg: "#44403c" },
};

export interface EmailTemplateInput {
  /** Also the headline inside the message. */
  subject: string;
  /** Plain-text body. Blank lines become paragraphs, single ones line breaks. */
  text: string;
  /** Used for the greeting; only the first name is shown. */
  recipientName?: string;
  /** Absolute URL for the button. Relative paths mean nothing in a mailbox. */
  link?: string;
  linkLabel?: string;
  /** Picks the pill. Comes straight from the notification that caused the mail. */
  category?: NotificationType;
  /** Absolute URL of the account settings page, linked in the footer. */
  settingsUrl: string;
}

/** Escapes the four characters that would otherwise break out of the markup. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The font stack, repeated on every text element because clients reset it. */
const FONT = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Someone's first name, for the greeting. Falls back to a plain "Hello". */
function greeting(name: string | undefined): string {
  const first = name?.trim().split(/\s+/)[0];
  return first ? `Hi ${escapeHtml(first)},` : "Hello,";
}

/**
 * Turns the plain-text body into paragraphs.
 *
 * A blank line starts a new <p>; a single newline becomes a <br />. Notification
 * bodies are one or two sentences today, but writing it this way means a longer
 * message doesn't arrive as one unbroken block.
 */
function paragraphs(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((block) => {
      const safe = escapeHtml(block).replace(/\n/g, "<br />");
      return `<p class="body-text" style="margin:0 0 14px;color:${COLOR.body};font-family:${FONT};font-size:15px;line-height:1.65">${safe}</p>`;
    })
    .join("");
}

/**
 * The call-to-action button.
 *
 * The background sits on the <td> and the padding on the <a> inside it: that
 * combination is the one every client draws correctly, including Outlook, and
 * it keeps the whole rectangle clickable rather than just the words. Outlook
 * squares off the rounded corners — an accepted cosmetic loss, since the VML
 * workaround for it is far more markup than the rounding is worth.
 */
function button(link: string, label: string): string {
  return `<table role="presentation" class="btn-wrap" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 6px">
        <tr>
          <td class="btn" align="center" bgcolor="${COLOR.brand}" style="border-radius:999px">
            <a href="${escapeHtml(link)}" style="display:inline-block;padding:14px 34px;border-radius:999px;color:#1c1917;font-family:${FONT};font-size:15px;font-weight:700;text-decoration:none">${escapeHtml(label)}</a>
          </td>
        </tr>
      </table>`;
}

/** The pill, when the event has a category we have a colour for. */
function pill(category: NotificationType | undefined): string {
  const style = category ? CATEGORY[category] : undefined;
  if (!style) return "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px">
        <tr>
          <td bgcolor="${style.bg}" style="border-radius:999px;padding:5px 12px;color:${style.fg};font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase">${escapeHtml(style.label)}</td>
        </tr>
      </table>`;
}

/**
 * Builds both bodies of one email: the HTML shown to nearly everyone, and the
 * plain-text alternative. Sending both is not optional — a message with only an
 * HTML part scores as spam with most filters, and some readers genuinely prefer
 * text.
 */
export function renderEmail(input: EmailTemplateInput): { html: string; text: string } {
  const label = input.linkLabel ?? "Open Buildora";

  // The preview line the inbox shows next to the subject. Left to itself a
  // client grabs whatever text comes first — usually "Hi Akib," — so the first
  // sentence of the body is put here deliberately, then hidden in the message.
  const preheader = escapeHtml(input.text.replace(/\s+/g, " ").trim().slice(0, 120));

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<!-- Tells clients that support it we have a dark rendering, so they show ours
     instead of inverting our colours themselves and mangling the contrast. -->
<meta name="color-scheme" content="light dark" />
<title>${escapeHtml(input.subject)}</title>
<style>
  /* Progressive only — see the note at the top of this file. Everything the
     layout depends on is inline; losing this block costs nothing but polish. */
  @media only screen and (max-width: 600px) {
    .pad { padding-left: 22px !important; padding-right: 22px !important; }
    .headline { font-size: 21px !important; }
    /* A full-width button is far easier to hit with a thumb. The wrapping
       table has to be stretched too — a table sizes to its content, so
       widening only the cell inside it changes nothing. */
    .btn-wrap { width: 100% !important; }
    .btn a { display: block !important; text-align: center !important; }
  }
  @media (prefers-color-scheme: dark) {
    .canvas { background: #0b1120 !important; }
    .card { background: #111a2e !important; }
    .headline, .ink { color: #f8fafc !important; }
    .body-text { color: #cbd5e1 !important; }
    .muted, .muted a { color: #94a3b8 !important; }
    .rule { border-color: #24304a !important; }
  }
</style>
</head>
<body class="canvas" style="margin:0;padding:0;background:${COLOR.canvas};-webkit-font-smoothing:antialiased">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;visibility:hidden">${preheader}</div>

  <table role="presentation" class="canvas" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.canvas}">
    <tr>
      <td align="center" style="padding:28px 12px 34px">

        <!-- The card. width + max-width together: Outlook honours the
             attribute, everything modern honours the style. -->
        <table role="presentation" class="card" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${COLOR.card};border-radius:18px;overflow:hidden">

          <!-- Header band: the mark, the wordmark, and a thin amber rule under
               them so the brand reads even in a crowded inbox. -->
          <tr>
            <td bgcolor="${COLOR.header}" style="padding:20px 28px">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <!-- The same house-frame mark as the site navbar, carried in
                       the message itself (see email-logo.ts). Sized with
                       attributes as well as CSS because Outlook ignores width
                       and height when they only appear in a style.
                       alt is deliberately empty: with images blocked the
                       wordmark beside it already says Buildora, and alt text
                       here would just print the name twice. -->
                  <td width="36"><img src="cid:${LOGO_CID}" width="36" height="36" alt="" style="display:block;border:0;width:36px;height:36px" /></td>
                  <td style="padding-left:11px;color:#ffffff;font-family:${FONT};font-size:19px;font-weight:800;letter-spacing:-0.2px">Buildora</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr><td bgcolor="${COLOR.brand}" style="height:3px;line-height:3px;font-size:0">&nbsp;</td></tr>

          <tr>
            <td class="pad" style="padding:30px 34px 34px">
              ${pill(input.category)}
              <h1 class="headline" style="margin:0 0 6px;color:${COLOR.ink};font-family:${FONT};font-size:23px;font-weight:800;line-height:1.3">${escapeHtml(input.subject)}</h1>
              <p class="body-text" style="margin:0 0 16px;color:${COLOR.body};font-family:${FONT};font-size:15px;line-height:1.65">${greeting(input.recipientName)}</p>
              ${paragraphs(input.text)}
              ${input.link ? button(input.link, label) : ""}
              ${
                input.link
                  ? `<p class="muted" style="margin:14px 0 0;color:${COLOR.muted};font-family:${FONT};font-size:12px;line-height:1.6;word-break:break-all">Button not working? Paste this into your browser:<br />${escapeHtml(input.link)}</p>`
                  : ""
              }
            </td>
          </tr>

          <tr>
            <td class="pad rule" style="padding:18px 34px 26px;border-top:1px solid ${COLOR.hairline}">
              <p class="muted" style="margin:0;color:${COLOR.muted};font-family:${FONT};font-size:12px;line-height:1.7">
                You're getting this because of activity on your Buildora account.<br />
                <a href="${escapeHtml(input.settingsUrl)}" style="color:${COLOR.muted};text-decoration:underline">Choose which emails you get</a>
              </p>
            </td>
          </tr>
        </table>

        <p class="muted" style="margin:16px 0 0;color:${COLOR.muted};font-family:${FONT};font-size:11px;line-height:1.6">
          Buildora — design, permits and construction, in one place.
        </p>

      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    greeting(input.recipientName).replace(/&amp;/g, "&"),
    "",
    input.text.trim(),
    ...(input.link ? ["", `${label}: ${input.link}`] : []),
    "",
    "—",
    "Buildora — you're getting this because of activity on your account.",
    `Choose which emails you get: ${input.settingsUrl}`,
  ].join("\n");

  return { html, text };
}
