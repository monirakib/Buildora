"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { UserRole, type PublicProfessional } from "@buildora/shared";
import { createInquiry, getProfessional } from "@/lib/api";
import { useSession } from "@/store/useSession";
import { Navbar } from "@/components/landing/Navbar";
import { PendingBadge, VerifiedBadge } from "@/components/app/VerifiedBadge";

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

/** Micro-label used above every editorial section, e.g. "SELECTED PROJECTS". */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-bold tracking-widest text-stone-500 uppercase dark:text-slate-400">
      {children}
    </p>
  );
}

/** One big-number stat ("12+ Years") — rendered only when the value exists. */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-3xl font-extrabold tracking-tight sm:text-4xl">{value}</p>
      <p className="mt-1 text-xs font-semibold text-stone-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

export default function ArchitectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const user = useSession((s) => s.user);
  const token = useSession((s) => s.token);

  const [architect, setArchitect] = useState<PublicProfessional | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Contact form state
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const a = await getProfessional(params.id);
        if (active) setArchitect(a);
      } catch {
        if (active) setNotFound(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [params.id]);

  async function handleContact(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      // Not signed in — send them to auth, then back here.
      router.push("/auth");
      return;
    }
    setError(null);
    setSending(true);
    try {
      await createInquiry(token, { architectId: params.id, message });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send your request");
    } finally {
      setSending(false);
    }
  }

  const isLandOwner = mounted && user?.role === UserRole.LAND_OWNER;
  const isSignedIn = mounted && !!user;

  if (loading || notFound || !architect) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <main className="flex-1 px-5 pt-28 pb-16 sm:px-8">
          <div className="mx-auto w-full max-w-3xl">
            <Link
              href="/architects"
              className="text-sm font-semibold text-stone-500 transition hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-400"
            >
              ← All architects
            </Link>
            {loading ? (
              <p className="mt-8 text-sm text-stone-500 dark:text-slate-500">Loading…</p>
            ) : (
              <div className="mt-8 rounded-2xl border border-white/50 bg-white/55 p-8 text-center backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
                <h1 className="text-xl font-extrabold">Architect not found</h1>
                <p className="mt-2 text-sm text-stone-600 dark:text-slate-400">
                  This profile may have been removed.
                </p>
                <Link
                  href="/architects"
                  className="mt-6 inline-block rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300"
                >
                  Back to directory
                </Link>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ---- Derived, real numbers (no invented stats — course rule) ----
  const projects = architect.portfolio ?? [];
  const awards = architect.achievements ?? [];
  const education = architect.education ?? [];
  // Expertise chips from the wizard; older profiles only have the free-text
  // specialties field, so fall back to splitting that on commas.
  const expertise =
    architect.expertise?.length
      ? architect.expertise
      : (architect.specialties ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
  const firstName = architect.name.split(" ")[0];

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1 px-5 pt-28 pb-16 sm:px-8">
        <div className="mx-auto w-full max-w-6xl">
          <Link
            href="/architects"
            className="text-sm font-semibold text-stone-500 transition hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-400"
          >
            ← All architects
          </Link>

          {/* ---- Hero: the architect's own statement left, portrait fading in
               from the right — the photo's left edge dissolves into the page so
               the two halves read as one composition. ---- */}
          <section className="mt-8 grid gap-8 lg:grid-cols-2 lg:items-center">
            <div className="relative z-10 lg:py-10">
              <h1 className="max-w-xl text-4xl leading-[1.08] font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                {architect.portfolioTitle || architect.name}
              </h1>

              {(architect.portfolioIntro || architect.bio) && (
                <p className="mt-6 max-w-md text-[15px] leading-relaxed text-stone-600 dark:text-slate-400">
                  {architect.portfolioIntro ||
                    (architect.bio!.length > 180
                      ? `${architect.bio!.slice(0, 180).trimEnd()}…`
                      : architect.bio)}
                </p>
              )}

              {projects.length > 0 && (
                <a
                  href="#projects"
                  className="mt-7 inline-flex items-center gap-3 text-sm font-bold underline-offset-8 transition hover:text-amber-600 hover:underline dark:hover:text-amber-400"
                >
                  View Projects <span aria-hidden>—</span>
                </a>
              )}

              {/* Stats row — each tile only appears when the data exists */}
              {(typeof architect.yearsExperience === "number" ||
                projects.length > 0 ||
                awards.length > 0) && (
                <div className="mt-10 flex flex-wrap gap-x-10 gap-y-6 border-t border-stone-200 pt-8 dark:border-white/10">
                  {typeof architect.yearsExperience === "number" && (
                    <Stat value={`${architect.yearsExperience}+`} label="Years" />
                  )}
                  {projects.length > 0 && <Stat value={`${projects.length}`} label="Projects" />}
                  {awards.length > 0 && <Stat value={`${awards.length}`} label="Awards" />}
                </div>
              )}
            </div>

            {/* Portrait — the mask dissolves its left edge into the page
               background (the mockup's fade); caption sits on the photo.
               Falls back to an initials card when there's no photo yet. */}
            {architect.avatarUrl ? (
              <figure className="relative lg:-ml-24">
                {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary-hosted */}
                <img
                  src={architect.avatarUrl}
                  alt={architect.name}
                  className="aspect-4/5 w-full object-cover mask-[linear-gradient(to_right,transparent,black_45%)] sm:aspect-4/3 lg:h-130 lg:aspect-auto"
                />
                <figcaption className="absolute top-1/2 right-5 z-10 max-w-[45%] -translate-y-1/2 text-white [text-shadow:0_1px_14px_rgba(0,0,0,0.55)]">
                  {architect.professionalTitle && (
                    <p className="text-sm font-medium text-white/85">
                      {architect.professionalTitle}
                    </p>
                  )}
                  <p className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                    {architect.name}
                  </p>
                  {architect.company && (
                    <p className="mt-0.5 text-sm text-white/85">{architect.company}</p>
                  )}
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <VerifiedBadge status={architect.verificationStatus} />
                    <PendingBadge status={architect.verificationStatus} />
                  </div>
                </figcaption>
              </figure>
            ) : (
              <figure className="relative overflow-hidden rounded-3xl">
                <div className="grid aspect-4/5 w-full place-items-center bg-stone-200 sm:aspect-4/3 dark:bg-white/5">
                  <span className="grid h-28 w-28 place-items-center rounded-3xl bg-amber-400 text-4xl font-extrabold text-stone-950">
                    {initials(architect.name)}
                  </span>
                </div>
                <figcaption className="absolute right-0 bottom-0 left-0 bg-linear-to-t from-black/60 to-transparent p-5 text-white">
                  <p className="text-lg font-extrabold">{architect.name}</p>
                  {(architect.company || architect.professionalTitle) && (
                    <p className="text-sm text-white/80">
                      {[architect.professionalTitle, architect.company].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <VerifiedBadge status={architect.verificationStatus} />
                    <PendingBadge status={architect.verificationStatus} />
                  </div>
                </figcaption>
              </figure>
            )}
          </section>

          {/* ---- Selected projects ---- */}
          {projects.length > 0 && (
            <section id="projects" className="mt-16 scroll-mt-28 border-t border-stone-200 pt-10 dark:border-white/10">
              <div className="flex items-end justify-between">
                <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                  Selected Projects
                </h2>
              </div>

              <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {projects.map((project, i) => (
                  <article key={i} className="group">
                    {project.imageUrls[0] ? (
                      <a
                        href={project.imageUrls[0]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block overflow-hidden rounded-2xl"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary-hosted */}
                        <img
                          src={project.imageUrls[0]}
                          alt={`${project.title} — cover photo`}
                          loading="lazy"
                          className="aspect-4/3 w-full object-cover transition duration-500 group-hover:scale-105"
                        />
                      </a>
                    ) : (
                      <div className="grid aspect-4/3 w-full place-items-center rounded-2xl bg-stone-200 text-xs font-semibold text-stone-500 dark:bg-white/5 dark:text-slate-400">
                        No photo yet
                      </div>
                    )}
                    <h3 className="mt-3 font-bold">{project.title}</h3>
                    <p className="mt-0.5 text-sm text-stone-500 dark:text-slate-400">
                      {[project.location, project.year].filter(Boolean).join("  ·  ")}
                      {project.buildingType ? `  ·  ${project.buildingType}` : ""}
                    </p>
                    {project.description && (
                      <p className="mt-1 line-clamp-2 text-sm text-stone-600 dark:text-slate-400">
                        {project.description}
                      </p>
                    )}
                    {project.imageUrls.length > 1 && (
                      <div className="mt-2 flex gap-1.5">
                        {project.imageUrls.slice(1, 5).map((url) => (
                          <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary-hosted */}
                            <img
                              src={url}
                              alt={`${project.title} — photo`}
                              loading="lazy"
                              className="h-10 w-14 rounded-md object-cover transition hover:opacity-80"
                            />
                          </a>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* ---- About / Expertise / In numbers ---- */}
          <section className="mt-16 grid gap-10 border-t border-stone-200 pt-10 sm:grid-cols-2 lg:grid-cols-3 dark:border-white/10">
            <div>
              <SectionLabel>About</SectionLabel>
              {architect.bio ? (
                <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-stone-600 dark:text-slate-400">
                  {architect.bio}
                </p>
              ) : (
                <p className="mt-3 text-sm text-stone-500 dark:text-slate-500">
                  This architect hasn&apos;t written a bio yet.
                </p>
              )}
              {architect.licenseAuthority && (
                <p className="mt-4 text-sm font-semibold">
                  Registered with {architect.licenseAuthority}
                </p>
              )}
              {architect.website && (
                <a
                  href={architect.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block truncate text-sm text-amber-600 underline underline-offset-2 dark:text-amber-400"
                >
                  {architect.website}
                </a>
              )}
            </div>

            {expertise.length > 0 && (
              <div>
                <SectionLabel>Expertise</SectionLabel>
                <ul className="mt-3 flex flex-col">
                  {expertise.map((area) => (
                    <li
                      key={area}
                      className="border-b border-stone-200 py-2.5 text-sm font-medium last:border-b-0 dark:border-white/10"
                    >
                      {area}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(typeof architect.yearsExperience === "number" ||
              projects.length > 0 ||
              awards.length > 0) && (
              <div>
                <SectionLabel>In Numbers</SectionLabel>
                <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-7">
                  {typeof architect.yearsExperience === "number" && (
                    <Stat value={`${architect.yearsExperience}+`} label="Years of experience" />
                  )}
                  {projects.length > 0 && (
                    <Stat value={`${projects.length}`} label="Projects showcased" />
                  )}
                  {awards.length > 0 && <Stat value={`${awards.length}`} label="Awards won" />}
                </div>
              </div>
            )}
          </section>

          {/* ---- Education / Recognition ---- */}
          {(education.length > 0 || awards.length > 0) && (
            <section className="mt-16 grid gap-10 border-t border-stone-200 pt-10 sm:grid-cols-2 dark:border-white/10">
              {education.length > 0 && (
                <div>
                  <SectionLabel>Education</SectionLabel>
                  <ul className="mt-4 flex flex-col gap-5">
                    {education.map((e, i) => (
                      <li key={i}>
                        <p className="font-bold">{e.degree}</p>
                        <p className="text-sm text-stone-600 dark:text-slate-400">
                          {e.institution}
                          {e.department ? ` — ${e.department}` : ""}
                        </p>
                        {e.year && (
                          <p className="text-sm text-stone-500 dark:text-slate-500">{e.year}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {awards.length > 0 && (
                <div>
                  <SectionLabel>Recognition</SectionLabel>
                  <ul className="mt-4 flex flex-col gap-3">
                    {awards.map((a, i) => (
                      <li key={i} className="text-sm">
                        <span className="font-bold">• {a.title}</span>
                        {a.year ? (
                          <span className="text-stone-600 dark:text-slate-400"> ({a.year})</span>
                        ) : null}
                        {a.description && (
                          <p className="mt-0.5 ml-3 text-stone-600 dark:text-slate-400">
                            {a.description}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {/* ---- Contact ---- */}
          <section className="mt-16 border-t border-stone-200 pt-10 dark:border-white/10">
            <div className="rounded-2xl border border-white/50 bg-white/55 p-6 shadow-xl shadow-black/5 backdrop-blur-xl sm:p-10 dark:border-white/10 dark:bg-white/5">
              <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                    Let&apos;s Create Something
                    <br />
                    Meaningful Together
                  </h2>
                  <p className="mt-2 text-sm text-stone-600 dark:text-slate-400">
                    Tell {firstName} about your project — location, plot size, building type, and
                    timeline.
                  </p>
                </div>
              </div>

              {sent ? (
                <div className="mt-6 rounded-xl bg-emerald-100 px-4 py-3 text-sm font-medium text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300">
                  Request sent. You&apos;ll see it — and any reply — under{" "}
                  <Link href="/inquiries" className="underline underline-offset-2">
                    Your requests
                  </Link>
                  .
                </div>
              ) : !isSignedIn ? (
                <div className="mt-6">
                  <p className="text-sm text-stone-600 dark:text-slate-400">
                    Sign in as a land owner to send a contact request.
                  </p>
                  <Link
                    href="/auth"
                    className="mt-4 inline-block rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300"
                  >
                    Sign in to contact
                  </Link>
                </div>
              ) : !isLandOwner ? (
                <p className="mt-5 text-sm text-stone-600 dark:text-slate-400">
                  Only land owners can send contact requests.
                </p>
              ) : (
                <form onSubmit={handleContact} className="mt-6 flex flex-col gap-3">
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    required
                    minLength={10}
                    maxLength={1000}
                    rows={4}
                    placeholder="Tell them about your project — location, plot size, building type, and timeline."
                    className="block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-3 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500"
                  />
                  {error && (
                    <p className="rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
                      {error}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={sending}
                    className="self-start rounded-full bg-amber-400 px-8 py-3 text-sm font-bold text-stone-950 shadow-lg transition hover:scale-[1.02] hover:bg-amber-300 disabled:scale-100 disabled:opacity-60"
                  >
                    {sending ? "Sending…" : "Start a Project"}
                  </button>
                </form>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
