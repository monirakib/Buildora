export type AlertTone = "danger" | "success" | "warning" | "info";

/**
 * An inline message. The look and the entrance animation come from the
 * `.alert` classes in globals.css; this component only adds the right ARIA
 * role, so an error is announced immediately and anything else politely.
 */
export function Alert({
  tone = "danger",
  className = "",
  children,
}: {
  tone?: AlertTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`alert alert-${tone} ${className}`}
    >
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}
