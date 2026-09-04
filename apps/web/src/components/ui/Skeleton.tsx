import { surfaceClass } from "./surface";

/** One shimmering block. Size it with width/height utilities. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />;
}

/**
 * A grid of card-shaped placeholders, for catalogues and directories.
 *
 * The shapes match the real card (image, title, two lines, a button), so when
 * the data lands nothing jumps: the skeleton was already standing where the
 * content goes.
 */
export function CardGridSkeleton({
  count = 6,
  className = "grid gap-5 sm:grid-cols-2 lg:grid-cols-3",
  media = true,
}: {
  count?: number;
  className?: string;
  media?: boolean;
}) {
  return (
    <div className={className} aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`${surfaceClass} overflow-hidden`}>
          {media && <Skeleton className="aspect-4/3 w-full rounded-none" />}
          <div className="p-5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="mt-2 h-3 w-1/3" />
            <Skeleton className="mt-4 h-3 w-full" />
            <Skeleton className="mt-1.5 h-3 w-5/6" />
            <div className="mt-5 flex items-center justify-between">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-9 w-28 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Stacked row placeholders, for lists of orders, projects, bids. */
export function ListSkeleton({ rows = 3, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`flex flex-col gap-4 ${className}`} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`${surfaceClass} p-5 sm:p-6`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="mt-2 h-3 w-1/3" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <Skeleton className="mt-4 h-3 w-full" />
          <Skeleton className="mt-1.5 h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}
