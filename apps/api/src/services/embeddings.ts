import { env } from "../config/env";

/**
 * Sentence embeddings, computed locally.
 *
 * transformers.js runs all-MiniLM-L6-v2 in this process through ONNX Runtime.
 * No API key, no per-call cost, no third party seeing our data, and nothing that
 * can rate limit us mid-demo — which is the whole reason it beats a hosted
 * embedding API here.
 *
 * **The model never runs on a request path, and that is a hard rule.**
 *
 * This API lives on a 512 MB Render instance. Loading MiniLM costs ~25 MB of
 * weights and a few hundred milliseconds, and inference peaks well above that.
 * An owner opening their estimate must never pay for it. The design that makes
 * this possible: *both sides of the comparison are embedded offline.*
 *
 *   - Price labels are embedded by the weekly refresh job (services/priceRefresh).
 *   - Rate-component queries are embedded by the same job.
 *   - Retrieval at request time is then cosine arithmetic over two stored
 *     arrays of numbers — see services/priceRetrieval. No model, no ONNX, no
 *     allocation beyond the vectors themselves.
 *
 * So everything in this file is called from the job and from seeds. If you find
 * yourself importing it into a controller, something has gone wrong.
 */

/**
 * Recorded on every vector. A model change makes old vectors incomparable —
 * cosine similarity between embeddings from two different models is noise — so
 * this is what lets the job re-embed only what is stale instead of everything.
 */
export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";

/** MiniLM-L6 outputs 384 dimensions. Used to reject anything malformed. */
export const EMBEDDING_DIMS = 384;

/**
 * The loaded pipeline, kept as a promise rather than a value.
 *
 * Two callers arriving together must not both start a load — the second would
 * allocate a second copy of the model on an instance that cannot afford one.
 * Caching the promise means the second caller awaits the first one's load.
 */
let extractorPromise: Promise<FeatureExtractor> | null = null;

/** The shape we actually use, kept narrow so the import stays lazy. */
type FeatureExtractor = (
  texts: string[],
  opts: { pooling: "mean"; normalize: boolean }
) => Promise<{ tolist(): number[][] }>;

async function getExtractor(): Promise<FeatureExtractor> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      // Imported here rather than at the top of the file so that merely
      // importing this module — which the models index does, transitively —
      // never pulls ONNX Runtime into memory. It loads when it is first needed
      // and not before.
      const { pipeline, env: hfEnv } = await import("@huggingface/transformers");

      // Weights are downloaded once and cached on disk. On Render's ephemeral
      // filesystem that cache dies with the instance, which is fine: the job
      // runs weekly, and re-downloading 25 MB once a week is cheaper than any
      // alternative.
      if (env.HF_CACHE_DIR) hfEnv.cacheDir = env.HF_CACHE_DIR;

      // q8 quantisation: roughly a quarter of the memory of fp32, with a
      // similarity ranking that is indistinguishable for our purposes. We are
      // ordering a dozen candidate prices, not doing semantic search at scale.
      const extractor = await pipeline("feature-extraction", EMBEDDING_MODEL, { dtype: "q8" });
      return extractor as unknown as FeatureExtractor;
    })();

    // A failed load must not be cached — otherwise one transient download
    // failure poisons the process until it restarts.
    extractorPromise.catch(() => {
      extractorPromise = null;
    });
  }
  return extractorPromise;
}

/**
 * Embeds a batch of short texts, returning one unit vector each.
 *
 * Batched on purpose: the per-call overhead dominates for strings this short, so
 * embedding forty price labels in one call is far cheaper than forty calls.
 * `normalize: true` returns unit vectors, which is what lets cosine similarity
 * later be a plain dot product.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const extractor = await getExtractor();
  const output = await extractor(texts, { pooling: "mean", normalize: true });
  const vectors = output.tolist();

  if (vectors.length !== texts.length) {
    throw new Error(`Embedding returned ${vectors.length} vectors for ${texts.length} texts`);
  }
  for (const v of vectors) {
    if (v.length !== EMBEDDING_DIMS) {
      throw new Error(`Embedding has ${v.length} dimensions, expected ${EMBEDDING_DIMS}`);
    }
  }
  return vectors;
}

/** One text. Convenience only — prefer embedBatch wherever there is a batch. */
export async function embedOne(text: string): Promise<number[]> {
  const [vector] = await embedBatch([text]);
  return vector!;
}

/**
 * Cosine similarity between two vectors, in [-1, 1].
 *
 * Written as a plain dot product because `embedBatch` normalises: for unit
 * vectors the magnitudes are both 1, so dividing by them is a no-op. If vectors
 * from somewhere else are ever compared here, normalise them first or this
 * silently returns the wrong scale.
 *
 * **This is the only part of embeddings that runs during a request**, and it is
 * a 384-iteration loop over numbers already in memory — microseconds.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i]! * b[i]!;
  return dot;
}

/**
 * The text a price is embedded as.
 *
 * The category is folded in because the labels alone are ambiguous — "cement"
 * appears in a mortar line, a grout line and a structural line, and the category
 * is what separates them. Kept in one function so the job and the query side can
 * never drift apart in how they phrase things, which would quietly wreck every
 * similarity score.
 */
export function priceEmbeddingText(category: string, itemLabel: string, unit: string): string {
  return `${itemLabel}, ${category.toLowerCase().replace(/_/g, " ")}, priced per ${unit}`;
}

/**
 * The matching text for a rate component. Deliberately phrased like the above.
 *
 * The category is dropped when the label already says it — a slice labelled
 * "cement" in the CEMENT category would otherwise embed as "cement, cement,
 * used in …", and the repetition pulls the vector toward a phrase nothing on the
 * price side ever produces.
 */
export function componentEmbeddingText(
  category: string,
  label: string,
  rateDescription: string
): string {
  const readable = category.toLowerCase().replace(/_/g, " ");
  const prefix = label.toLowerCase().includes(readable) ? label : `${label}, ${readable}`;
  return `${prefix}, used in ${rateDescription.toLowerCase()}`;
}
