import { env } from "../config/env";
import { BoqRate } from "../models/BoqRate";
import type { CostEstimate, CostLine } from "@buildora/shared";

/**
 * Cost and material estimate for a build.
 *
 * The important design decision: **the arithmetic is not done by the model.**
 * Quantities and money come from the BoqRate table — the same admin-editable
 * rates the tender BOQ is built from — multiplied by the floor area. Gemini is
 * given the finished numbers and asked only to write the explanation.
 *
 * That split matters. A language model asked to multiply rates will produce
 * numbers that look right and occasionally aren't, and an owner budgeting a
 * building deserves better than plausible. It also means the estimate agrees
 * with the BOQ a contractor will later bid against, because both read the same
 * table. Without an API key the figures are unchanged; only the prose is
 * missing.
 */

const GEMINI_TIMEOUT_MS = 20000;

/**
 * Builds the priced line items from the rate table.
 *
 * `quantityPerSqft` is the rate row's own coefficient — how much of that item a
 * square foot of building consumes — so the whole estimate scales from one
 * number the owner already knows.
 */
export async function priceBuild(areaSqft: number): Promise<CostLine[]> {
  const rates = await BoqRate.find({ active: true }).sort({ order: 1, category: 1 });

  return rates.map((rate) => {
    const quantity = Math.round(rate.quantityPerSqft * areaSqft * 100) / 100;
    return {
      description: rate.description,
      category: rate.category,
      unit: rate.unit,
      quantity,
      ratePerUnitBdt: rate.ratePerUnitBdt,
      totalBdt: Math.round(quantity * rate.ratePerUnitBdt),
    };
  });
}

/** Asks Gemini to explain the numbers. Returns undefined when it can't. */
async function narrate(
  areaSqft: number,
  floors: number,
  buildingType: string,
  lines: CostLine[],
  totalBdt: number
): Promise<string | undefined> {
  if (!env.GEMINI_API_KEY) return undefined;

  // The model is shown the computed figures and told they are settled. Framing
  // it as commentary rather than calculation is what keeps it from "correcting"
  // arithmetic it was never asked to do.
  const table = lines
    .map(
      (l) =>
        `${l.description} (${l.category}): ${l.quantity} ${l.unit} @ ${l.ratePerUnitBdt} = ${l.totalBdt} BDT`
    )
    .join("\n");

  const prompt = `You are a quantity surveyor in Bangladesh writing a short note for a land owner.

These figures are already calculated and are NOT to be recalculated or corrected:
Building: ${floors}-storey ${buildingType.toLowerCase().replace(/_/g, " ")}, ${areaSqft} sqft total floor area.
${table}
TOTAL: ${totalBdt} BDT

Write 3 short paragraphs, plain English, no markdown headings:
1. What this estimate covers and roughly what it works out to per square foot.
2. The two or three line items that dominate the cost, and why.
3. What could push the real figure up or down, soil conditions, finish quality, material price movement. Be specific to Bangladesh.

Do not invent numbers that are not above. Do not give advice about hiring.`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4 },
        }),
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      }
    );

    if (!res.ok) {
      console.error(`[estimator] Gemini ${res.status}`);
      return undefined;
    }

    const body = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = body.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim();
    return text || undefined;
  } catch (err) {
    // A missing narrative is a much smaller loss than a failed estimate, so
    // this never propagates.
    console.error("[estimator] narrative unavailable:", err instanceof Error ? err.message : err);
    return undefined;
  }
}

/** The whole estimate: real arithmetic from the rate table, prose from Gemini. */
export async function estimateBuild(input: {
  areaSqft: number;
  floors: number;
  buildingType: string;
}): Promise<CostEstimate> {
  const lines = await priceBuild(input.areaSqft);
  const totalBdt = lines.reduce((sum, l) => sum + l.totalBdt, 0);

  // Grouped for the UI, which shows category subtotals before the detail.
  const byCategory = new Map<string, number>();
  for (const line of lines) {
    byCategory.set(line.category, (byCategory.get(line.category) ?? 0) + line.totalBdt);
  }

  return {
    areaSqft: input.areaSqft,
    floors: input.floors,
    buildingType: input.buildingType,
    lines,
    byCategory: [...byCategory.entries()].map(([category, totalBdt]) => ({ category, totalBdt })),
    totalBdt,
    perSqftBdt: input.areaSqft > 0 ? Math.round(totalBdt / input.areaSqft) : 0,
    narrative: await narrate(input.areaSqft, input.floors, input.buildingType, lines, totalBdt),
    ratesFrom: lines.length,
    estimatedAt: new Date().toISOString(),
  };
}
