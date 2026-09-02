"use client";

import { useEffect } from "react";
import { StatusScreen, actionClass } from "@/components/app/StatusScreen";

/**
 * The route-level error boundary. Next renders this in place of the page when a
 * render throws, keeping the root layout — so the navbar, theme and background
 * survive a crash rather than the whole app going white.
 *
 * `reset()` re-renders the failed segment. It is worth offering because a good
 * share of what lands here is a transient fetch failure against a cold API
 * instance, which a second attempt fixes.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is the only handle on a production stack trace, which Next
    // strips from the client. Logging it here is what makes a report actionable.
    console.error("[buildora] unhandled error", error.digest ?? "", error);
  }, [error]);

  return (
    <StatusScreen
      code="Something broke"
      title="That didn't load."
      message="This one is on us, not you. Try again — and if it keeps happening, the reference below helps us find it."
    >
      <button type="button" onClick={reset} className={actionClass}>
        Try again
      </button>
      {error.digest ? (
        <p className="mt-4 w-full font-mono text-xs text-stone-400 dark:text-slate-600">
          Reference {error.digest}
        </p>
      ) : null}
    </StatusScreen>
  );
}
