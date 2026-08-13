import { normalizeNid, type NidOcrResult } from "@buildora/shared";
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
  "note": string|null       // short reason when readable is false
}

Rules:
- Transcribe only what you can actually see. Never guess or complete a partial number.
- If a field is missing or illegible, use null for that field.
- If the image is not a Bangladeshi NID card, set readable to false and say so in note.`;

interface RawOcr {
  readable?: boolean;
  name?: string | null;
  nid?: string | null;
  dateOfBirth?: string | null;
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
 * Runs the OCR comparison. Throws when Gemini can't be reached at all, so the
 * caller can record "couldn't check" rather than "failed the check".
 */
export async function readNidCard(
  imageUrl: string,
  claimed: { name: string; nid: string; dateOfBirth?: string }
): Promise<NidOcrResult> {
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
              { text: PROMPT },
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

  let parsed: RawOcr;
  try {
    parsed = JSON.parse(text) as RawOcr;
  } catch {
    console.error(`[nid] unparseable OCR reply: ${text.slice(0, 200)}`);
    return { readable: false, note: "The reader returned something unexpected" };
  }

  if (!parsed.readable) {
    return { readable: false, note: parsed.note ?? "The card couldn't be read from that image" };
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
    nameMatches: printedName ? namesAgree(printedName, claimed.name) : null,
    nidMatches: printedNid ? printedNid === normalizeNid(claimed.nid) : null,
    dobMatches:
      printedDob && claimed.dateOfBirth
        ? printedDob.slice(0, 10) === claimed.dateOfBirth.slice(0, 10)
        : null,
    note: parsed.note ?? undefined,
  };
}
