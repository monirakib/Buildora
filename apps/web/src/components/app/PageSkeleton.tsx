/**
 * The placeholder Next shows while a route's JavaScript is still downloading.
 *
 * It matters most on the heavy routes — the design studio pulls in three.js and
 * a model kit, the admin console pulls in charts — where the gap between the
 * click and the first paint is long enough to feel broken. A shaped skeleton in
 * the page's own colours reads as "loading", where a blank screen reads as
 * "nothing happened".
 *
 * `aria-busy` with a polite live region is what makes that legible to a screen
 * reader too, which sees no visual shimmer at all.
 */
export function PageSkeleton({ lines = 3 }: { lines?: number }) {
  const bar = "animate-pulse rounded-xl bg-black/5 dark:bg-white/5";
  return (
    <main
      className="flex-1 px-5 pt-28 pb-16 sm:px-8"
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading"
    >
      <div className="mx-auto w-full max-w-4xl">
        <div className={`${bar} h-4 w-28`} />
        <div className={`${bar} mt-4 h-10 w-3/4 max-w-md`} />
        <div className={`${bar} mt-3 h-4 w-full max-w-xl`} />
        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {Array.from({ length: lines }).map((_, i) => (
            <div key={i} className={`${bar} h-36`} />
          ))}
        </div>
      </div>
    </main>
  );
}
