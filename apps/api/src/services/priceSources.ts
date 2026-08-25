import { ProductCategory } from "@buildora/shared";

/**
 * Reading published prices off manufacturers' own price pages.
 *
 * Every source here was checked against three tests before it went in:
 *
 *   1. **robots.txt permits it.** Bashundhara's WordPress site disallows only
 *      /wp-admin/; the price page is fair game for any crawler.
 *   2. **It is a public marketing page**, not something behind a login, a paywall
 *      or an anti-bot challenge. No credential is presented and none is needed.
 *   3. **The data is factual.** A price is not a creative work, and we store the
 *      source name and URL beside every figure so the claim can be checked.
 *
 * Sources that failed those tests were deliberately left out. Bikroy and Daraz
 * both have terms prohibiting automated extraction and Daraz runs active
 * anti-bot; scraping either would be both wrong and fragile. TCB publishes the
 * most authoritative figures of anyone and serves them over a TLS chain Node
 * refuses to verify, and disabling certificate checks to read a government price
 * list is not a trade anybody should make. Those stay human-entered.
 *
 * **Everything read here lands unapproved.** A price page redesign turns a
 * parser into a machine for producing confident nonsense, so nothing from this
 * file can move an owner's estimate until an admin has looked at it. The parsers
 * are also written to fail loudly — an unparseable page throws rather than
 * returning zero rows, because "the source published nothing this week" and "our
 * regex stopped matching" must never look the same in the logs.
 */

/** Long enough for a slow origin, short enough not to hold the job open. */
const TIMEOUT_MS = 15000;

/**
 * Sent on every request. Identifying the crawler and giving somewhere to
 * complain is the same courtesy Nominatim requires of us in geo.controller, and
 * it is the right default whether or not a site insists on it.
 */
const USER_AGENT =
  "BuildoraPriceBot/1.0 (+https://buildora.software; CSE471 academic project; contact via site)";

/** One price read off a page. Deliberately the shape MarketPrice stores. */
export interface ScrapedPrice {
  category: ProductCategory;
  itemLabel: string;
  unit: string;
  priceBdt: number;
}

export interface PriceSource {
  /** Shown to admins and stored on every row this source produces. */
  name: string;
  url: string;
  parse(html: string): ScrapedPrice[];
}

/* ------------------------------------------------------------- helpers ---- */

/**
 * Strips tags and decodes the handful of entities that show up in price tables,
 * so the parsers below can work on plain text.
 */
function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pulls a BDT figure out of a cell, taking the midpoint when a range is quoted.
 *
 * Ranges are the normal case, not the exception: these pages say "480 – 530"
 * because the real price depends on the dealer. Taking the midpoint is the
 * honest reduction — taking the low end would systematically under-price every
 * estimate built on it.
 */
function parsePrice(text: string): number | null {
  const numbers = [...text.matchAll(/(\d[\d,]*(?:\.\d+)?)/g)]
    .map((m) => Number(m[1]!.replace(/,/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (numbers.length === 0) return null;
  if (numbers.length === 1) return numbers[0]!;

  // A range: first two numbers, averaged. Anything beyond the first two is
  // footnote noise (a year, a bag weight) and is ignored.
  const [low, high] = numbers;
  return Math.round(((low! + high!) / 2) * 100) / 100;
}

/** Every `<tr>` in the document, as arrays of cell text. */
function tableRows(html: string): string[][] {
  return [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
    [...row[1]!.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => textOf(cell[1]!))
  );
}

/* ------------------------------------------------------------- sources ---- */

/**
 * Bashundhara publishes an OPC and a PCC table, each brand on its own row with
 * a price or a range per 50 kg bag.
 *
 * The parser reads *any* two-column row whose second column contains a
 * plausible bag price, rather than hunting for particular brand names. Brands
 * come and go from that table; the shape of it does not.
 */
const bashundharaCement: PriceSource = {
  name: "Bashundhara Cement published price list",
  url: "https://www.bashundharacement.com/cement-price-in-bangladesh/",
  parse(html) {
    const prices: ScrapedPrice[] = [];

    for (const cells of tableRows(html)) {
      if (cells.length < 2) continue;
      const label = cells[0]!;
      const price = parsePrice(cells[1]!);

      // A cement bag outside this band is a header row, a weight, or a parse
      // that went wrong. Better to drop it than to store it.
      if (!price || price < 300 || price > 1200) continue;
      if (!/cement|opc|pcc/i.test(label)) continue;

      prices.push({
        category: ProductCategory.CEMENT,
        itemLabel: `${label}, 50kg bag`.replace(/\s+/g, " ").trim(),
        unit: "bag",
        priceBdt: price,
      });
    }

    if (prices.length === 0) {
      throw new Error("no cement rows matched — the page layout has probably changed");
    }
    return prices;
  },
};

/**
 * Far-Mac publishes a per-brand rod table in Tk per tonne.
 *
 * Converted to Tk/kg on the way in, because that is the unit the BOQ
 * reinforcement line is measured in. Doing the conversion here rather than at
 * read time means everything downstream compares like with like.
 */
const farMacSteel: PriceSource = {
  name: "Far-Mac Steel published rod price list",
  url: "https://farmacsteel.com/blog/all-rod-price-in-bangladesh-today-2026-bsrm-ksrm-gph-aks-ricl-rod-price-per-kg-ton",
  parse(html) {
    const prices: ScrapedPrice[] = [];

    for (const cells of tableRows(html)) {
      if (cells.length < 2) continue;
      const label = cells[0]!;
      if (!/rod|steel|bsrm|ksrm|gph|aks|ricl|grade/i.test(label)) continue;

      // Some rows quote per kg, some per tonne. Which one is decided by the
      // magnitude rather than by the header, because the headers are
      // inconsistent across these tables and the magnitudes are not.
      const raw = parsePrice(cells[1]!);
      if (!raw) continue;

      const perKg = raw > 10000 ? raw / 1000 : raw;
      if (perKg < 40 || perKg > 250) continue;

      prices.push({
        category: ProductCategory.STEEL,
        itemLabel: label.replace(/\s+/g, " ").trim(),
        unit: "kg",
        priceBdt: Math.round(perKg * 100) / 100,
      });
    }

    if (prices.length === 0) {
      throw new Error("no rod rows matched — the page layout has probably changed");
    }
    return prices;
  },
};

export const PRICE_SOURCES: PriceSource[] = [bashundharaCement, farMacSteel];

/**
 * Fetches and parses one source. Throws with a readable reason — the caller
 * records it against the run rather than letting one dead site fail the job.
 */
export async function fetchSource(source: PriceSource): Promise<ScrapedPrice[]> {
  let res: Response;
  try {
    res = await fetch(source.url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new Error("unreachable or timed out");
  }

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = await res.text();
  const prices = source.parse(html);

  // A page that suddenly yields a hundred rows has matched something it
  // shouldn't have — a navigation menu, a comment thread. Refuse it.
  if (prices.length > 40) {
    throw new Error(`${prices.length} rows parsed, which is implausible — treating as a bad parse`);
  }
  return prices;
}
