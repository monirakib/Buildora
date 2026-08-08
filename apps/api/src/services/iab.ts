import {
  iabCategoryLabel,
  iabNameMatches,
  iabStatusLabel,
  isRegularIabStatus,
  type IabCheck,
  type IabMember,
} from "@buildora/shared";

/**
 * Membership lookups against the Institute of Architects Bangladesh public
 * directory (https://iab.org.bd/directory/).
 *
 * IAB publishes no API. The directory page is a WordPress site whose member
 * list is drawn by jQuery after load, so there is nothing useful in the page
 * HTML — but the call it makes is a plain POST to WordPress's admin-ajax.php
 * with `action=fetch_member_data`, and that endpoint answers anyone. (It takes
 * a `nonce` argument that the handler never checks; we send an empty one
 * rather than scraping a value that would expire on us.)
 *
 * The reply is `{ success, data: { html, count } }` where `html` is the
 * rendered result cards, so the members have to be read back out of that
 * markup — see parseMembers below.
 */

const DIRECTORY_URL = "https://iab.org.bd/wp-admin/admin-ajax.php";
const REQUEST_TIMEOUT_MS = 12000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // six hours — memberships change rarely
const CACHE_LIMIT = 300;

/** The handful of HTML entities that show up in member names. */
function decodeEntities(s: string): string {
  return s
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#0?38;|&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

/** Pulls the text out of the first `<div class="…cls…">text</div>` in a chunk. */
function pick(chunk: string, cls: string): string | undefined {
  const match = new RegExp(`class="${cls}[^"]*"[^>]*>([^<]*)<`).exec(chunk);
  const value = match?.[1] && decodeEntities(match[1]).replace(/\s+/g, " ").trim();
  return value || undefined;
}

/**
 * Reads one labelled detail out of a card's info section, which is a run of
 * title/value pairs:
 *
 *   <div class="info-title">Email</div>
 *   <div class="info-details">someone@example.com</div>
 *
 * Cards carry different details — Email, Contact, Present Address, District,
 * Zip, Blood Group — so the label has to be matched rather than the position.
 */
function pickLabelled(chunk: string, label: string): string | undefined {
  const pairs = chunk.matchAll(
    /class="info-title"[^>]*>([^<]*)<[\s\S]*?class="info-details"[^>]*>([^<]*)</g
  );
  for (const [, title, value] of pairs) {
    if (!title || !value) continue;
    if (decodeEntities(title).trim().toLowerCase() !== label.toLowerCase()) continue;
    const detail = decodeEntities(value).replace(/\s+/g, " ").trim();
    if (detail) return detail;
  }
  return undefined;
}

/** Cheap sanity check — the directory's email column is hand-entered. */
function asEmail(value: string | undefined): string | undefined {
  const email = value?.trim().toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;
}

/**
 * Reads the member cards out of the directory's HTML fragment.
 *
 * Splitting on the card wrapper is enough to isolate one member per chunk;
 * within a chunk the number, name, grade and standing each sit in their own
 * div with a fixed class (`user-id`, `user-name`, `label gray`, `label color`).
 */
function parseMembers(html: string): IabMember[] {
  const members: IabMember[] = [];

  // The first chunk is the "N RESULTS FOUND" banner, so it's dropped.
  for (const chunk of html.split('<div class="card').slice(1)) {
    const membershipNo = pick(chunk, "user-id");
    const name = pick(chunk, "user-name");
    const rawStatus = pick(chunk, "label color");
    if (!membershipNo || !name || !rawStatus) continue;

    const rawCategory = pick(chunk, "label gray");
    members.push({
      membershipNo,
      name,
      email: asEmail(pickLabelled(chunk, "Email")),
      // Both the official label and the directory's own word: if IAB ever adds
      // a tier we don't map, the raw value still reaches the supervisor.
      category: iabCategoryLabel(rawCategory),
      status: iabStatusLabel(rawStatus),
      rawCategory,
      rawStatus,
      isRegular: isRegularIabStatus(rawStatus),
    });
  }

  return members;
}

const cache = new Map<string, { at: number; member: IabMember | null }>();

function readCache(key: string) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return hit;
}

function writeCache(key: string, member: IabMember | null) {
  // Oldest entry goes first once the cache is full (Map keeps insertion order).
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), member });
}

/**
 * Builds the stored result, comparing the directory's name against the name on
 * the account when one was supplied. `nameMatches` stays null when there was no
 * record to compare against — "not found" is not a name mismatch.
 */
function toCheck(
  membershipNo: string,
  member: IabMember | null,
  checkedAt: string,
  claimedName?: string
): IabCheck {
  return {
    membershipNo,
    member,
    checkedAt,
    claimedName,
    nameMatches: member && claimedName ? iabNameMatches(claimedName, member.name) : null,
  };
}

/**
 * Looks one membership number up in the IAB directory, optionally checking the
 * name on the record against `claimedName`.
 *
 * Throws when the directory can't be reached, so the caller can tell "IAB says
 * this number doesn't exist" (member: null) apart from "we couldn't ask".
 */
export async function lookupIabMember(
  membershipNo: string,
  claimedName?: string
): Promise<IabCheck> {
  const cached = readCache(membershipNo);
  if (cached) {
    return toCheck(membershipNo, cached.member, new Date(cached.at).toISOString(), claimedName);
  }

  const body = new URLSearchParams({
    action: "fetch_member_data",
    search: "",
    member_id: membershipNo,
    status: "all",
    chapter_id: "all",
    page: "1",
    nonce: "",
  });

  let res: Response;
  try {
    res = await fetch(DIRECTORY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // The directory only answers requests that look like its own page.
        Referer: "https://iab.org.bd/directory/",
        "User-Agent": "Buildora/0.1 (architect verification; +https://iab.org.bd/directory/)",
      },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error("Couldn't reach the IAB directory — try again in a moment");
  }

  if (!res.ok) {
    console.error(`[iab] directory responded ${res.status}`);
    throw new Error("The IAB directory isn't responding — try again in a moment");
  }

  const payload = (await res.json().catch(() => null)) as {
    success?: boolean;
    data?: { html?: string };
  } | null;

  if (!payload?.success || typeof payload.data?.html !== "string") {
    throw new Error("The IAB directory returned something unexpected");
  }

  // `member_id` is a partial match on IAB's side — searching "920" returns
  // AA-920, and "AA-" returns every associate. Only an exact hit on the number
  // counts as proof, so the returned cards are filtered again here.
  const member =
    parseMembers(payload.data.html).find((m) => m.membershipNo === membershipNo) ?? null;

  writeCache(membershipNo, member);
  return toCheck(membershipNo, member, new Date().toISOString(), claimedName);
}
