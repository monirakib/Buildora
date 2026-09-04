import { surfaceClass } from "./surface";

/**
 * What a list shows when there is nothing in it yet.
 *
 * Says three things in order: what this space is for, why it is empty, and
 * what to do about it. The icon floats gently, which is the only motion here:
 * an empty state should feel calm, not like something failed.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: {
  icon: React.ReactNode;
  title: string;
  description: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`${surfaceClass} animate-rise-in flex flex-col items-center px-6 py-12 text-center ${className}`}
    >
      <span className="animate-float grid h-14 w-14 place-items-center rounded-2xl bg-amber-400/15 text-amber-700 dark:text-amber-300">
        {icon}
      </span>
      <p className="mt-5 text-lg font-extrabold tracking-tight">{title}</p>
      <p className="mt-1.5 max-w-sm text-sm text-stone-600 dark:text-slate-400">{description}</p>
      {action && <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
