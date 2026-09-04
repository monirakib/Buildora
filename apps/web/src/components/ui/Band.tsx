/**
 * A full-width band of the page: the unit of composition for a page that
 * makes one claim per screen.
 *
 * Three tones. `ground` sits straight on the site canvas (the warm paper and
 * its drifting washes), `band` lifts a section on a translucent glass wash
 * between two hairlines, and `dark` is the one black band a page may spend on
 * its most dramatic moment. Separation comes from the tone changing, so the
 * band itself carries no card, no border of its own, no shadow.
 */
export function Band({
  tone = "ground",
  id,
  className = "",
  narrow = false,
  children,
}: {
  tone?: "ground" | "band" | "dark";
  id?: string;
  className?: string;
  /** Text-width column instead of the page column. */
  narrow?: boolean;
  children: React.ReactNode;
}) {
  const tones = {
    ground: "",
    band: "border-y border-stone-200/80 bg-white/45 backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.035]",
    dark: "bg-stone-950 text-white dark:bg-black",
  };
  return (
    <section
      id={id}
      data-tone={tone}
      className={`scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28 lg:py-32 ${tones[tone]} ${className}`}
    >
      <div className={`mx-auto w-full ${narrow ? "max-w-3xl" : "max-w-6xl"}`}>{children}</div>
    </section>
  );
}

/**
 * The headline of a band: eyebrow, title, one sentence. Centred by default,
 * because a claim reads as a claim when it stands alone in the middle.
 */
export function BandHeading({
  eyebrow,
  title,
  lead,
  align = "center",
  as: Tag = "h2",
  dark = false,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  align?: "center" | "left";
  as?: "h1" | "h2";
  /** Set inside a dark band so the secondary text stays legible. */
  dark?: boolean;
}) {
  const centred = align === "center";
  return (
    <div className={`flex flex-col gap-4 ${centred ? "items-center text-center" : "items-start"}`}>
      {eyebrow && (
        <p
          className={`text-sm font-bold tracking-[0.2em] uppercase ${
            dark ? "text-amber-400" : "text-amber-800 dark:text-amber-400"
          }`}
        >
          {eyebrow}
        </p>
      )}
      <Tag className="display-title max-w-3xl text-4xl sm:text-5xl lg:text-6xl">{title}</Tag>
      {lead && (
        <p
          className={`max-w-2xl text-lg leading-relaxed sm:text-xl ${
            dark ? "text-white/70" : "text-stone-600 dark:text-slate-400"
          }`}
        >
          {lead}
        </p>
      )}
    </div>
  );
}
