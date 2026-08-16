/**
 * Strips the rejected value out of zod's issue list before it goes into a 400
 * response.
 *
 * The auth endpoints return `details: parsed.error.issues` so forms can point at
 * the field that failed — but those endpoints also take passwords, and zod's
 * issue type declares an optional `input` field holding the value that was
 * rejected. On the installed version the finalized issues don't carry it, so
 * nothing leaks today; that is zod's serialization choice, though, not ours, and
 * a future upgrade could change it silently.
 *
 * So we drop it here instead of relying on that. "The password can't appear in
 * an error response" should be a property of our code, not a property of a
 * dependency's current behaviour.
 */
export function safeIssues<T extends object>(issues: readonly T[]): Record<string, unknown>[] {
  return issues.map((issue) => {
    const copy = { ...issue } as Record<string, unknown>;
    delete copy.input;
    delete copy.received;
    return copy;
  });
}
