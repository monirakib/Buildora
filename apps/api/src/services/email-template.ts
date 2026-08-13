import { NotificationType } from "@buildora/shared";
import { LOGO_CID } from "./email-logo";

/**
 * The look of every email Buildora sends.
 *
 * Kept apart from the sending code in email.ts so the design can be read (and
 * changed) without touching the mail provider, and so one layout covers every
 * event: a verification decision, an escrow release and a booked meeting all
 * arrive looking like they came from the same platform.
 *
 * Email is not the web. Three rules shape everything below:
 *
 *   1. Layout is done with tables, not flexbox or grid. Outlook on Windows
 *      renders HTML with Word's engine, which has no support for either.
 *   2. Styles are inline on each element. Gmail strips <style> blocks in
 *      several of its clients, so anything structural has to survive without
 *      them. The one <style> we do send only carries progressive extras (the
 *      mobile tweaks and dark mode), which are fine to lose.
 *   3. One image only, carried inside the message. Most clients block remote
 *      images until the reader clicks "show images", so anything load-bearing
 *      has to be drawn with coloured table cells and text instead. That is why
 *      the feature tiles below hold numbers rather than icon files: three more
 *      PNGs would ride along with every message we ever send.
 */

/** Buildora's colours, in the plain hex that mail clients understand. */
const COLOR = {
  canvas: "#eceae7", // the page behind the card
  card: "#ffffff",
  ink: "#16130f", // headings, and the dark header and footer bands
  brand: "#f5b400", // the amber used across the web app
  brandSoft: "#fdf1d2", // the pill behind the category label
  brandInk: "#7a5200", // text on that pill
  body: "#4a443e", // paragraphs
  muted: "#8a8580", // small print
  mutedDark: "#9d968d", // small print on the dark bands
  panel: "#f6f4f1", // the fallback link box
  hairline: "#e7e4e0",
};

/**
 * The label on the pill above the headline, so the reader knows what kind of
 * thing this is before reading a word of it.
 *
 * Only the events that can actually reach a mailbox are listed. EMAIL_WORTHY in
 * packages/shared/src/delivery.ts decides that, and anything missing simply
 * renders without a pill rather than breaking.
 *
 * One colour for all of them, unlike the old rainbow: the pill is brand
 * furniture, not a traffic light, and eight tints made every message look like
 * it came from a different product.
 */
const CATEGORY: Partial<Record<NotificationType, string>> = {
  [NotificationType.PAYMENT]: "Payment",
  [NotificationType.MILESTONE]: "Milestone",
  [NotificationType.VERIFICATION]: "Verification",
  [NotificationType.MEETING]: "Meeting",
  [NotificationType.PROPOSAL]: "Proposal",
  [NotificationType.CONTRACT]: "Contract",
  [NotificationType.ORDER]: "Order",
  [NotificationType.TENDER]: "Tender",
  [NotificationType.BID]: "Bid",
  [NotificationType.SYSTEM]: "Buildora",
};

/** One of the three tiles under "what's waiting inside". */
export interface EmailHighlight {
  title: string;
  blurb: string;
}

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
  /**
   * A word or phrase inside `subject` to paint amber in the headline. Kept
   * separate rather than marked up inside the subject itself, because the same
   * string is what the inbox shows in its list and asterisks there would look
   * like a mistake.
   */
  accent?: string;
  /** Small print under the button, e.g. how long the link lasts. */
  meta?: string;
  /** Picks the pill. Comes straight from the notification that caused the mail. */
  category?: NotificationType;
  /**
   * The three tiles. Off by default: they belong on a welcome or confirmation
   * mail, not on "your escrow tranche was released", where the reader already
   * knows what the platform does.
   */
  highlights?: EmailHighlight[];
  /** Absolute URL of the account settings page, linked in the footer. */
  settingsUrl: string;
  /** Absolute URL of the site root, linked from the header and footer. */
  homeUrl?: string;
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

/** For the fallback URL, where a fixed width stops it wrapping mid-character. */
const MONO = "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace";

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
      return `<p class="body-text" style="margin:0 0 14px;color:${COLOR.body};font-family:${FONT};font-size:15px;line-height:1.7">${safe}</p>`;
    })
    .join("");
}

/**
 * The call-to-action button.
 *
 * The background sits on the <td> and the padding on the <a> inside it: that
 * combination is the one every client draws correctly, including Outlook, and
 * it keeps the whole rectangle clickable rather than just the words. Outlook
 * squares off the rounded corners, an accepted cosmetic loss, since the VML
 * workaround for it is far more markup than the rounding is worth.
 */
function button(link: string, label: string): string {
  return `<table role="presentation" class="btn-wrap" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0">
        <tr>
          <td class="btn" align="center" bgcolor="${COLOR.brand}" style="border-radius:12px">
            <a href="${escapeHtml(link)}" style="display:inline-block;padding:15px 30px;border-radius:12px;color:${COLOR.ink};font-family:${FONT};font-size:15px;font-weight:800;text-decoration:none">${escapeHtml(label)} &nbsp;&rarr;</a>
          </td>
        </tr>
      </table>`;
}

/**
 * The headline, with one phrase optionally picked out in amber.
 *
 * Both halves are escaped before anything is spliced in, so the accent can
 * never be used to inject markup: the search runs on the escaped string and
 * only our own span is added.
 */
function headline(subject: string, accent: string | undefined): string {
  const safe = escapeHtml(subject);
  if (!accent) return safe;

  const needle = escapeHtml(accent);
  const at = safe.toLowerCase().indexOf(needle.toLowerCase());
  if (at < 0) return safe;

  const before = safe.slice(0, at);
  const hit = safe.slice(at, at + needle.length);
  const after = safe.slice(at + needle.length);
  return `${before}<span style="color:${COLOR.brand}">${hit}</span>${after}`;
}

/** The category pill above the headline. */
function pill(category: NotificationType | undefined): string {
  const label = category ? CATEGORY[category] : undefined;
  if (!label) return "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px">
        <tr>
          <td class="pill" bgcolor="${COLOR.brandSoft}" style="border-radius:999px;padding:7px 14px;color:${COLOR.brandInk};font-family:${FONT};font-size:11px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase">&bull;&nbsp;&nbsp;${escapeHtml(label)}</td>
        </tr>
      </table>`;
}

/**
 * The three feature tiles.
 *
 * Laid out as one row of cells rather than floated boxes, and the media query
 * stacks them on a phone by turning the cells into blocks. The numbered square
 * stands in for the icon a web page would use, for the reason given at the top
 * of this file.
 */
function highlights(items: EmailHighlight[]): string {
  if (items.length === 0) return "";

  const cells = items
    .map(
      (item, i) => `<td class="tile" width="33%" valign="top" style="padding:0 6px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${COLOR.hairline};border-radius:14px">
                <tr>
                  <td style="padding:16px 14px 18px">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px">
                      <tr>
                        <td width="34" height="34" align="center" bgcolor="${COLOR.ink}" style="width:34px;height:34px;border-radius:10px;color:${COLOR.brand};font-family:${FONT};font-size:13px;font-weight:800">${String(i + 1).padStart(2, "0")}</td>
                      </tr>
                    </table>
                    <p class="ink" style="margin:0 0 4px;color:${COLOR.ink};font-family:${FONT};font-size:14px;font-weight:800">${escapeHtml(item.title)}</p>
                    <p class="muted" style="margin:0;color:${COLOR.muted};font-family:${FONT};font-size:12px;line-height:1.5">${escapeHtml(item.blurb)}</p>
                  </td>
                </tr>
              </table>
            </td>`
    )
    .join("");

  return `<tr>
            <td class="pad rule" style="padding:26px 28px 30px;border-top:1px solid ${COLOR.hairline}">
              <p class="eyebrow" style="margin:0 0 14px;color:${COLOR.muted};font-family:${FONT};font-size:11px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase">What's waiting inside</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 -6px">
                <tr>${cells}</tr>
              </table>
            </td>
          </tr>`;
}

/**
 * The "button not working" panel.
 *
 * The reference design puts a copy button here, which cannot work: mail clients
 * run no JavaScript. So the URL is simply shown in full, in a monospace face
 * that makes it safe to read out or select by hand.
 */
function fallbackLink(link: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0">
        <tr>
          <td class="panel" bgcolor="${COLOR.panel}" style="border-radius:14px;padding:16px 18px">
            <p class="muted" style="margin:0 0 8px;color:${COLOR.muted};font-family:${FONT};font-size:10px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase">Button not working? Use this link</p>
            <p class="link-text" style="margin:0;color:${COLOR.body};font-family:${MONO};font-size:12px;line-height:1.6;word-break:break-all">${escapeHtml(link)}</p>
          </td>
        </tr>
      </table>`;
}

/**
 * Builds both bodies of one email: the HTML shown to nearly everyone, and the
 * plain-text alternative. Sending both is not optional. A message with only an
 * HTML part scores as spam with most filters, and some readers genuinely prefer
 * text.
 */
export function renderEmail(input: EmailTemplateInput): { html: string; text: string } {
  const label = input.linkLabel ?? "Open Buildora";
  const home = input.homeUrl ?? input.settingsUrl;
  const tiles = input.highlights ?? [];

  // The preview line the inbox shows next to the subject. Left to itself a
  // client grabs whatever text comes first, usually "Hi Akib,", so the first
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
  /* Progressive only, see the note at the top of this file. Everything the
     layout depends on is inline; losing this block costs nothing but polish. */
  @media only screen and (max-width: 600px) {
    .pad { padding-left: 22px !important; padding-right: 22px !important; }
    .headline { font-size: 26px !important; }
    /* A full-width button is far easier to hit with a thumb. The wrapping
       table has to be stretched too, because a table sizes to its content and
       widening only the cell inside it changes nothing. */
    .btn-wrap { width: 100% !important; }
    .btn a { display: block !important; text-align: center !important; }
    /* Three tiles side by side are unreadable on a phone, so each cell becomes
       a full-width block and they stack. */
    .tile { display: block !important; width: 100% !important; padding: 0 0 10px !important; }
  }
  @media (prefers-color-scheme: dark) {
    .canvas { background: #0b0a09 !important; }
    .card { background: #171512 !important; }
    .headline, .ink { color: #faf9f7 !important; }
    .body-text { color: #d6d1ca !important; }
    .muted, .muted a, .eyebrow { color: #a49d94 !important; }
    .rule { border-color: #2b2721 !important; }
    .panel { background: #201d19 !important; }
    .link-text { color: #d6d1ca !important; }
  }
</style>
</head>
<body class="canvas" style="margin:0;padding:0;background:${COLOR.canvas};-webkit-font-smoothing:antialiased">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;visibility:hidden">${preheader}</div>

  <table role="presentation" class="canvas" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.canvas}">
    <tr>
      <td align="center" style="padding:26px 12px 34px">

        <!-- The card. width + max-width together: Outlook honours the
             attribute, everything modern honours the style. -->
        <table role="presentation" class="card" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${COLOR.card};border-radius:20px;overflow:hidden">

          <!-- Header band: the mark and wordmark on the left, one link on the
               right, so the brand reads even in a crowded inbox. -->
          <tr>
            <td bgcolor="${COLOR.ink}" style="padding:18px 24px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <!-- The same house-frame mark as the site navbar,
                             carried in the message itself (see email-logo.ts).
                             Sized with attributes as well as CSS because
                             Outlook ignores width and height when they only
                             appear in a style. alt is deliberately empty: with
                             images blocked the wordmark beside it already says
                             Buildora, and alt text would print the name twice. -->
                        <td width="30"><img src="cid:${LOGO_CID}" width="30" height="30" alt="" style="display:block;border:0;width:30px;height:30px" /></td>
                        <td style="padding-left:10px;color:#ffffff;font-family:${FONT};font-size:17px;font-weight:800;letter-spacing:-0.2px">Buildora</td>
                      </tr>
                    </table>
                  </td>
                  <td align="right">
                    <a href="${escapeHtml(input.settingsUrl)}" style="color:${COLOR.mutedDark};font-family:${FONT};font-size:10px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;text-decoration:none">Account</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="pad" style="padding:32px 28px 30px">
              ${pill(input.category)}
              <h1 class="headline" style="margin:0 0 14px;color:${COLOR.ink};font-family:${FONT};font-size:30px;font-weight:800;line-height:1.2;letter-spacing:-0.6px">${headline(input.subject, input.accent)}</h1>
              <p class="body-text" style="margin:0 0 14px;color:${COLOR.body};font-family:${FONT};font-size:15px;line-height:1.7">${greeting(input.recipientName)}</p>
              ${paragraphs(input.text)}
              ${input.link ? button(input.link, label) : ""}
              ${
                input.meta
                  ? `<p class="muted" style="margin:14px 0 0;color:${COLOR.muted};font-family:${FONT};font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase">${escapeHtml(input.meta)}</p>`
                  : ""
              }
              ${input.link ? fallbackLink(input.link) : ""}
            </td>
          </tr>

          ${highlights(tiles)}

          <!-- Footer band, dark like the header so the card reads as one
               object rather than a page that ran out. -->
          <tr>
            <td bgcolor="${COLOR.ink}" style="padding:24px 28px 26px">
              <p style="margin:0 0 14px;font-family:${FONT};font-size:10px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase">
                <a href="${escapeHtml(home)}" style="color:#ffffff;text-decoration:none">Buildora</a>
                <span style="color:${COLOR.mutedDark}">&nbsp;&nbsp;&middot;&nbsp;&nbsp;</span>
                <a href="${escapeHtml(input.settingsUrl)}" style="color:#ffffff;text-decoration:none">Email preferences</a>
              </p>
              <p style="margin:0;color:${COLOR.mutedDark};font-family:${FONT};font-size:12px;line-height:1.65">
                You're receiving this because of activity on your Buildora account. If it wasn't you, you can ignore this message and nothing will change.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 0">
                <tr><td style="height:1px;line-height:1px;font-size:0;background:#2b2721">&nbsp;</td></tr>
              </table>
              <p style="margin:14px 0 0;color:#6f6960;font-family:${FONT};font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase">
                Buildora &middot; Bangladesh &middot; Design, permits and construction in one place
              </p>
            </td>
          </tr>
        </table>

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
    ...(input.meta ? ["", input.meta] : []),
    ...(tiles.length
      ? ["", "What's waiting inside:", ...tiles.map((t) => `* ${t.title}: ${t.blurb}`)]
      : []),
    "",
    "---",
    "Buildora. You're receiving this because of activity on your account.",
    `Choose which emails you get: ${input.settingsUrl}`,
  ].join("\n");

  return { html, text };
}
