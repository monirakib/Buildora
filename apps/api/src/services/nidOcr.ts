import { normalizeNid, type NidBackResult, type NidOcrResult } from "@buildora/shared";
import { env } from "../config/env";

/**
 * Reads a photographed NID card with Gemini and compares what's printed on it
 * against what the user typed.
 *
 * This is the only part of the NID pre-screen that looks at the document
 * itself. It catches the cases the arithmetic can't: a number typed correctly
 * but belonging to a card that says someone else's name, or an upload that
 * isn't an NID at all.
 *
 * It still proves nothing about whether the NID is genuine — a convincing
 * forgery reads perfectly. Only the Election Commission can answer that, and
 * its Porichoy gateway is fee-based and restricted to vetted companies. So this
 * feeds a supervisor's decision; it never replaces it.
 */

const IMAGE_TIMEOUT_MS = 15000;
const GEMINI_TIMEOUT_MS = 30000;
/** Cloudinary originals are a few hundred KB; anything larger isn't a card photo. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const PROMPT = `You are reading a photograph of a Bangladeshi National ID (NID) card.

Return ONLY a JSON object, no markdown fence, with these keys:
{
  "readable": boolean,      // false if the image is unreadable or not an NID card
  "name": string|null,      // full name printed in English, exactly as printed
  "nid": string|null,       // the NID / ID number, digits only
  "dateOfBirth": string|null, // printed date of birth as YYYY-MM-DD
  "side": string|null,      // "FRONT", "BACK" or "OTHER"
  "faceCount": number|null, // how many human faces are visible in the image
  "hasPhotoBox": boolean|null, // is there a portrait photo box where an NID front has one
  "note": string|null       // short reason when readable is false
}

Rules:
- Transcribe only what you can actually see. Never guess or complete a partial number.
- If a field is missing or illegible, use null for that field.
- The front of an NID carries the photo, name and number; the back carries the address.
- Count faces on the card itself, including the small ghost portrait if one is printed.
- If the image is not a Bangladeshi NID card, set readable to false and say so in note.`;

/**
 * The back of the card. A separate prompt because it's a different document:
 * no photo, no number, but a permanent address we can compare against what the
 * user declared — which is the signal the PDF417 barcode would have carried.
 *
 * Reading the barcode itself was considered and dropped: its payload is
 * encoded rather than plain text, and the laminated legacy cards a lot of
 * people still hold have no barcode at all, so a decoder would return nothing
 * most of the time while adding a dependency to explain.
 */
const BACK_PROMPT = `You are reading the BACK of a Bangladeshi National ID (NID) card.

Return ONLY a JSON object, no markdown fence, with these keys:
{
  "readable": boolean,      // false if unreadable or this is not the back of an NID
  "address": string|null,   // the permanent address block, transcribed as printed
  "issueDate": string|null, // printed issue date as YYYY-MM-DD
  "hasBarcode": boolean|null, // is a barcode or machine-readable strip visible
  "note": string|null       // short reason when readable is false
}

Rules:
- Transcribe only what you can actually see. Never invent an address.
- Transcribe the address in English if it is printed in English, otherwise in Bangla.
- If the image is the FRONT of a card (photo, name and number), set readable to false
  and say so in note.`;

interface RawOcr {
  readable?: boolean;
  name?: string | null;
  nid?: string | null;
  dateOfBirth?: string | null;
  side?: string | null;
  faceCount?: number | null;
  hasPhotoBox?: boolean | null;
  note?: string | null;
}

interface RawBack {
  readable?: boolean;
  address?: string | null;
  issueDate?: string | null;
  hasBarcode?: boolean | null;
  note?: string | null;
}

/** Downloads the uploaded card and hands Gemini the bytes inline. */
async function fetchImageAsBase64(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Couldn't fetch the NID image (${res.status})`);

  const type = res.headers.get("content-type") ?? "image/jpeg";
  if (!type.startsWith("image/")) throw new Error("That upload isn't an image");

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error("That image is too large to read");

  return { mimeType: type.split(";")[0]!, data: buffer.toString("base64") };
}

/**
 * Compares two names loosely enough to survive an OCR pass.
 *
 * The card is photographed at an angle under bad light, so a strict comparison
 * would fail constantly. Requiring most of the printed words to appear in the
 * typed name catches a different person while tolerating a dropped initial or a
 * misread character in one word.
 */
function namesAgree(printed: string, typed: string): boolean {
  const words = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 1);

  const printedWords = words(printed);
  const typedWords = new Set(words(typed));
  if (printedWords.length === 0 || typedWords.size === 0) return false;

  const shared = printedWords.filter((w) => typedWords.has(w)).length;
  return shared / printedWords.length >= 0.6;
}

/**
 * Sends one card image to Gemini with the given prompt and parses the JSON
 * back. Shared by the front and back readers — they differ only in the prompt
 * and in what they do with the answer.
 *
 * Throws when Gemini can't be reached at all, so the caller can record
 * "couldn't check" rather than "failed the check". Returns undefined when the
 * reply came back but wasn't JSON.
 */
async function askGemini<T>(imageUrl: string, prompt: string): Promise<T | undefined> {
  if (!env.GEMINI_API_KEY) throw new Error("NID reading isn't configured (GEMINI_API_KEY)");

  const image = await fetchImageAsBase64(imageUrl);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              { inline_data: { mime_type: image.mimeType, data: image.data } },
            ],
          },
        ],
        // Transcription, not composition — no room for invention.
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    }
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[nid] Gemini ${res.status}: ${detail.slice(0, 300)}`);
    throw new Error(
      res.status === 429
        ? "The document reader is busy, try again shortly"
        : "Couldn't read the NID image"
    );
  }

  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

  try {
    return JSON.parse(text) as T;
  } catch {
    console.error(`[nid] unparseable OCR reply: ${text.slice(0, 200)}`);
    return undefined;
  }
}

/**
 * Reads the front of the card and compares what's printed against what was
 * typed. Throws when Gemini can't be reached, so the caller records "couldn't
 * check" rather than "failed the check".
 */
export async function readNidCard(
  imageUrl: string,
  claimed: { name: string; nid: string; dateOfBirth?: string }
): Promise<NidOcrResult> {
  const parsed = await askGemini<RawOcr>(imageUrl, PROMPT);
  if (!parsed) {
    return { readable: false, note: "The reader returned something unexpected" };
  }

  const faceCount = typeof parsed.faceCount === "number" ? parsed.faceCount : null;
  const side = parsed.side?.trim().toUpperCase() || undefined;

  if (!parsed.readable) {
    return {
      readable: false,
      side,
      faceCount,
      hasPhotoBox: parsed.hasPhotoBox ?? null,
      note: parsed.note ?? "The card couldn't be read from that image",
    };
  }

  const printedNid = parsed.nid ? normalizeNid(parsed.nid) : undefined;
  const printedName = parsed.name?.trim() || undefined;
  const printedDob = parsed.dateOfBirth?.trim() || undefined;

  // Each comparison is null when the card didn't yield that field — "not read"
  // is not the same as "doesn't match", and a supervisor needs to see which.
  return {
    readable: true,
    name: printedName,
    nid: printedNid,
    dateOfBirth: printedDob,
    side,
    faceCount,
    hasPhotoBox: parsed.hasPhotoBox ?? null,
    nameMatches: printedName ? namesAgree(printedName, claimed.name) : null,
    nidMatches: printedNid ? printedNid === normalizeNid(claimed.nid) : null,
    dobMatches:
      printedDob && claimed.dateOfBirth
        ? printedDob.slice(0, 10) === claimed.dateOfBirth.slice(0, 10)
        : null,
    note: parsed.note ?? undefined,
  };
}

/**
 * Reads the back of the card and checks whether the printed permanent address
 * names the district the applicant declared.
 *
 * Matching is a plain case-insensitive substring test on the district name.
 * That's deliberately loose: the address is hand-set on the card, transcribed
 * by a model, and may be in Bangla, so anything stricter would disagree with
 * itself constantly. A false match costs nothing — the supervisor reads the
 * address anyway — while a false mismatch would accuse an honest applicant.
 */
export async function readNidCardBack(
  imageUrl: string,
  claimed: { permanentDistrict?: string }
): Promise<NidBackResult> {
  const parsed = await askGemini<RawBack>(imageUrl, BACK_PROMPT);
  if (!parsed) {
    return { readable: false, note: "The reader returned something unexpected" };
  }

  if (!parsed.readable) {
    return {
      readable: false,
      hasBarcode: parsed.hasBarcode ?? null,
      note: parsed.note ?? "The back of the card couldn't be read from that image",
    };
  }

  const address = parsed.address?.trim() || undefined;
  const district = claimed.permanentDistrict?.trim();

  return {
    readable: true,
    address,
    issueDate: parsed.issueDate?.trim() || undefined,
    hasBarcode: parsed.hasBarcode ?? null,
    districtMatches:
      address && district ? address.toLowerCase().includes(district.toLowerCase()) : null,
    note: parsed.note ?? undefined,
  };
}
