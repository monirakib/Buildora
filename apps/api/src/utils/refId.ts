/**
 * The id behind a Mongoose reference, whether it came back populated or as a
 * bare ObjectId.
 *
 * Worth a helper because the same field is both, depending on the query that
 * loaded it: `String(doc.owner)` gives the id when the ref is raw, but
 * "[object Object]" once someone adds a `.populate()` upstream — a bug that
 * only shows up at runtime, in whichever comparison happens to use it.
 */
export function refId(ref: unknown): string {
  if (ref && typeof ref === "object" && "_id" in ref) {
    return String((ref as { _id: unknown })._id);
  }
  return String(ref);
}
