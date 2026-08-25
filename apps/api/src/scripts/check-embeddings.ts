/**
 * Checks that the embedding model loads and ranks sensibly on this machine.
 * Run from apps/api: `pnpm check:embeddings`. Touches no database.
 *
 * Worth having as a real script rather than a throwaway, for two reasons.
 * First, the model is downloaded on first use, so this is how you warm the cache
 * deliberately instead of discovering the download inside a request. Second, it
 * prints peak memory — the number that decides whether this can run alongside
 * everything else on a 512 MB Render instance, and the one you want to check
 * again if the model is ever changed.
 *
 * The test itself is the smallest honest one: ask for structural cement and
 * confirm the cement listings rank above a steel and a paint listing. If that
 * ordering ever fails, retrieval is not doing what services/priceRetrieval
 * claims and the composition repricing is picking prices at random.
 */
import {
  componentEmbeddingText,
  cosineSimilarity,
  embedBatch,
  priceEmbeddingText,
} from "../services/embeddings";

async function main() {
  const started = Date.now();

  // The query side: the cement slice of the RCC rate.
  const query = componentEmbeddingText(
    "CEMENT",
    "cement",
    "RCC works (1:1.5:3) including shuttering"
  );

  // Candidates, including two deliberate wrong-category distractors.
  const candidates = [
    priceEmbeddingText("CEMENT", "OPC cement, 50kg bag", "bag"),
    priceEmbeddingText("CEMENT", "PCC cement, 50kg bag", "bag"),
    priceEmbeddingText("STEEL", "MS deformed bar, 60 grade", "kg"),
    priceEmbeddingText("PAINT", "Plastic paint, interior", "litre"),
  ];

  const vectors = await embedBatch([query, ...candidates]);
  const elapsed = Date.now() - started;

  const [queryVec, ...candidateVecs] = vectors;

  console.log(`[check] loaded model and embedded ${vectors.length} texts in ${elapsed}ms`);
  console.log(`[check] dimensions: ${queryVec!.length}`);
  console.log(`\n  query: ${query}\n`);

  const scored = candidates
    .map((label, i) => ({ label, score: cosineSimilarity(queryVec!, candidateVecs[i]!) }))
    .sort((a, b) => b.score - a.score);

  for (const s of scored) console.log(`  ${s.score.toFixed(3)}  ${s.label}`);

  const top = scored[0]!;
  const passed = top.label.includes("cement");
  console.log(`\n[check] top match is a cement listing: ${passed ? "PASS" : "FAIL"}`);
  console.log(`[check] peak memory: ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`);

  if (!passed) process.exit(1);
}

main().catch((err) => {
  console.error("[check] failed:", err);
  process.exit(1);
});
