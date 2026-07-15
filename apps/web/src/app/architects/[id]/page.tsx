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
          ) : notFound || !architect ? (
            <div className="mt-8 rounded-3xl border border-white/40 bg-white/40 p-8 text-center backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
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
          ) : (
            <>
              {/* Header */}
              <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center">
                <span className="grid h-20 w-20 shrink-0 place-items-center rounded-3xl bg-amber-400 text-2xl font-extrabold text-stone-950">
                  {initials(architect.name)}
                </span>
                <div>
                  <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                    {architect.name}
                  </h1>
                  {architect.company && (
                    <p className="text-stone-600 dark:text-slate-400">{architect.company}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <VerifiedBadge status={architect.verificationStatus} />
                    <PendingBadge status={architect.verificationStatus} />
                  </div>
                </div>
              </div>

              {/* Details */}
              <dl className="mt-8 grid gap-5 sm:grid-cols-2">
                {architect.specialties && (
                  <div className="rounded-2xl border border-white/40 bg-white/40 p-5 backdrop-blur dark:border-white/10 dark:bg-white/5">
                    <dt className="text-xs font-bold tracking-wider text-stone-500 uppercase dark:text-slate-400">
                      Specialties
                    </dt>
                    <dd className="mt-1 text-sm">{architect.specialties}</dd>
                  </div>
                )}
                {typeof architect.yearsExperience === "number" && (
                  <div className="rounded-2xl border border-white/40 bg-white/40 p-5 backdrop-blur dark:border-white/10 dark:bg-white/5">
                    <dt className="text-xs font-bold tracking-wider text-stone-500 uppercase dark:text-slate-400">
                      Experience
                    </dt>
                    <dd className="mt-1 text-sm">{architect.yearsExperience} years</dd>
                  </div>
                )}
                {architect.licenseAuthority && (
                  <div className="rounded-2xl border border-white/40 bg-white/40 p-5 backdrop-blur dark:border-white/10 dark:bg-white/5">
                    <dt className="text-xs font-bold tracking-wider text-stone-500 uppercase dark:text-slate-400">
                      Registered with
                    </dt>
                    <dd className="mt-1 text-sm">{architect.licenseAuthority}</dd>
                  </div>
                )}
                {architect.website && (
                  <div className="rounded-2xl border border-white/40 bg-white/40 p-5 backdrop-blur dark:border-white/10 dark:bg-white/5">
                    <dt className="text-xs font-bold tracking-wider text-stone-500 uppercase dark:text-slate-400">
                      Website
                    </dt>
                    <dd className="mt-1 truncate text-sm">
                      <a
                        href={architect.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-amber-600 underline underline-offset-2 dark:text-amber-400"
                      >
                        {architect.website}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>

              {architect.bio && (
                <div className="mt-5 rounded-2xl border border-white/40 bg-white/40 p-5 backdrop-blur dark:border-white/10 dark:bg-white/5">
                  <dt className="text-xs font-bold tracking-wider text-stone-500 uppercase dark:text-slate-400">
                    About
                  </dt>
                  <p className="mt-1 text-sm whitespace-pre-line">{architect.bio}</p>
                </div>
              )}

              {/* Education */}
              {(architect.education?.length ?? 0) > 0 && (
                <div className="mt-5 rounded-2xl border border-white/40 bg-white/40 p-5 backdrop-blur dark:border-white/10 dark:bg-white/5">
                  <p className="text-xs font-bold tracking-wider text-stone-500 uppercase dark:text-slate-400">
                    Education
                  </p>
                  <ul className="mt-2 flex flex-col gap-2">
                    {architect.education!.map((e, i) => (
                      <li key={i} className="text-sm">
                        <span className="font-semibold">{e.degree}</span>{" "}
                        <span className="text-stone-600 dark:text-slate-400">
                          — {e.institution}
                          {e.year ? `, ${e.year}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Achievements */}
              {(architect.achievements?.length ?? 0) > 0 && (
                <div className="mt-5 rounded-2xl border border-white/40 bg-white/40 p-5 backdrop-blur dark:border-white/10 dark:bg-white/5">
                  <p className="text-xs font-bold tracking-wider text-stone-500 uppercase dark:text-slate-400">
                    Achievements
                  </p>
                  <ul className="mt-2 flex flex-col gap-2.5">
                    {architect.achievements!.map((a, i) => (
                      <li key={i} className="text-sm">
                        <span className="font-semibold">{a.title}</span>
                        {a.year ? (
                          <span className="text-stone-600 dark:text-slate-400"> ({a.year})</span>
                        ) : null}
                        {a.description && (
                          <p className="mt-0.5 text-stone-600 dark:text-slate-400">
                            {a.description}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Portfolio gallery */}
              {(architect.portfolio?.length ?? 0) > 0 && (
                <div className="mt-10">
                  <h2 className="text-lg font-bold">Portfolio</h2>
                  <div className="mt-4 flex flex-col gap-5">
                    {architect.portfolio!.map((project, i) => (
                      <div
                        key={i}
                        className="rounded-2xl border border-white/40 bg-white/40 p-5 backdrop-blur dark:border-white/10 dark:bg-white/5"
                      >
                        <p className="font-bold">
                          {project.title}
                          <span className="font-medium text-stone-600 dark:text-slate-400">
                            {project.location ? ` · ${project.location}` : ""}
                            {project.year ? ` · ${project.year}` : ""}
                          </span>
                        </p>
                        {project.description && (
                          <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
                            {project.description}
                          </p>
                        )}
                        {project.imageUrls.length > 0 && (
                          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {project.imageUrls.map((url) => (
                              <a
                                key={url}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block overflow-hidden rounded-xl"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary-hosted */}
                                <img
                                  src={url}
                                  alt={`${project.title} — design photo`}
                                  loading="lazy"
                                  className="aspect-4/3 w-full object-cover transition duration-300 hover:scale-105"
                                />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Contact */}
              <div className="mt-10 rounded-3xl border border-white/40 bg-white/40 p-6 shadow-xl shadow-black/5 backdrop-blur-xl sm:p-8 dark:border-white/10 dark:bg-white/5">
                <h2 className="text-lg font-bold">Contact {architect.name.split(" ")[0]}</h2>

                {sent ? (
                  <div className="mt-4 rounded-xl bg-emerald-100 px-4 py-3 text-sm font-medium text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300">
                    Request sent. You&apos;ll see it — and any reply — under{" "}
                    <Link href="/inquiries" className="underline underline-offset-2">
                      Your requests
                    </Link>
                    .
                  </div>
                ) : !isSignedIn ? (
                  <div className="mt-4">
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
                  <p className="mt-3 text-sm text-stone-600 dark:text-slate-400">
                    Only land owners can send contact requests.
                  </p>
                ) : (
                  <form onSubmit={handleContact} className="mt-4 flex flex-col gap-3">
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
                      {sending ? "Sending…" : "Send contact request"}
                    </button>
                  </form>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
