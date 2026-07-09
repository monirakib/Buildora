"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { LandOwnerProfile, SessionUser } from "@buildora/shared";
import { updateProfile } from "@/lib/api";
import { useSession } from "@/store/useSession";
import { Navbar } from "@/components/landing/Navbar";

const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10";

const labelClass = "mb-1.5 block text-sm font-semibold";

/**
 * Liquid-glass card — translucent tint, heavy frosted blur + saturation, a
 * bright inset edge, and a soft top sheen (::before). Matches the navbar and
 * auth cards. Inner content is wrapped in `relative z-10` to sit above the sheen.
 */
const sectionClass =
  "relative overflow-hidden rounded-3xl border border-white/40 bg-white/30 p-6 shadow-2xl shadow-black/10 backdrop-blur-2xl backdrop-saturate-150 sm:p-8 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-40 before:bg-linear-to-b before:from-white/40 before:to-transparent before:content-[''] dark:border-white/15 dark:bg-white/10 dark:shadow-black/40 dark:before:from-white/15";

/** Everything is kept as strings; the API coerces numbers and drops blanks. */
function formFromUser(user: SessionUser) {
  // This page edits land-owner build details; professionals get their own
  // profile editor with the verification feature (roadmap step 3). Narrow the
  // union so the land-owner fields are readable.
  const p = user.profile as LandOwnerProfile | undefined;
  return {
    name: user.name,
    phone: user.phone ?? "",
    nid: p?.nid ?? "",
    avatarUrl: p?.avatarUrl ?? "",
    company: p?.company ?? "",
    bio: p?.bio ?? "",
    landAreaKatha: p?.landAreaKatha?.toString() ?? "",
    buildingType: p?.buildingType ?? "",
    budgetMinBdt: p?.budgetMinBdt?.toString() ?? "",
    budgetMaxBdt: p?.budgetMaxBdt?.toString() ?? "",
    floors: p?.floors?.toString() ?? "",
  };
}

type FormState = ReturnType<typeof formFromUser>;

const roleLabels: Record<string, string> = {
  LAND_OWNER: "Land owner",
  ARCHITECT: "Architect",
  STRUCTURAL_ENGINEER: "Structural engineer",
  CONTRACTOR: "Contractor",
  SUPPLIER: "Supplier",
  ADMIN: "Admin",
};

export default function ProfilePage() {
  const router = useRouter();
  const { user, token, setSession } = useSession();

  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // The session store hydrates from localStorage on the client, so wait for
  // mount before trusting `user` (same pattern as the auth page).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // After hydration: bounce logged-out visitors, and prefill the form from the
  // stored user exactly once (the `f ?? …` keeps later renders from clobbering
  // whatever the user has typed).
  useEffect(() => {
    if (!mounted) return;
    if (!user) {
      router.replace("/auth");
      return;
    }
    // Professionals have their own richer editor (credentials, education,
    // portfolio, verification) — this page is the land-owner/admin one.
    const professionalRoles: string[] = [
      "ARCHITECT",
      "STRUCTURAL_ENGINEER",
      "CONTRACTOR",
      "SUPPLIER",
    ];
    if (professionalRoles.includes(user.role)) {
      router.replace("/profile/professional");
      return;
    }
    setForm((f) => f ?? formFromUser(user));
  }, [mounted, user, router]);

  const set =
    (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setSaved(false);
      setForm((f) => (f ? { ...f, [field]: e.target.value } : f));
    };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !token) return;
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const updated = await updateProfile(token, form);
      setSession(updated, token); // keep the navbar & rest of the app in sync
      setSaved(true);
    } catch (err) {
      if (err instanceof TypeError) {
        setError("Can't reach the server. Please try again in a moment.");
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      {/* pt-28 clears the fixed navbar (top-4 + h-14) */}
      <main className="flex-1 px-5 pt-28 pb-16 sm:px-8">
        <div className="mx-auto w-full max-w-2xl">
          {!form || !user ? (
            <p className="text-center text-sm text-stone-500 dark:text-slate-500">Loading…</p>
          ) : (
            <>
              {/* Identity header: initials avatar + who's signed in */}
              <div className="flex items-center gap-4">
                <span className="grid h-14 w-14 place-items-center rounded-full bg-amber-400 text-xl font-extrabold text-stone-950">
                  {user.name
                    .split(" ")
                    .slice(0, 2)
                    .map((w) => w[0]?.toUpperCase())
                    .join("")}
                </span>
                <div>
                  <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                    {user.name}
                  </h1>
                  <p className="text-sm text-stone-500 dark:text-slate-400">
                    {user.email} · {roleLabels[user.role] ?? user.role}
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-6">
                <section className={sectionClass}>
                  <div className="relative z-10">
                  <h2 className="text-lg font-bold">Account</h2>
                  <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">
                    Your basic contact details.
                  </p>

                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label htmlFor="username" className={labelClass}>
                        Username{" "}
                        <span className="font-medium text-stone-500 dark:text-slate-400">(permanent)</span>
                      </label>
                      <input
                        id="username"
                        type="text"
                        value={user.username}
                        readOnly
                        disabled
                        className={`${inputClass} cursor-not-allowed opacity-70`}
                      />
                    </div>
                    <div>
                      <label htmlFor="name" className={labelClass}>
                        Full name
                      </label>
                      <input
                        id="name"
                        type="text"
                        required
                        minLength={2}
                        autoComplete="name"
                        value={form.name}
                        onChange={set("name")}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label htmlFor="phone" className={labelClass}>
                        Phone
                      </label>
                      <input
                        id="phone"
                        type="tel"
                        autoComplete="tel"
                        placeholder="01XXXXXXXXX"
                        value={form.phone}
                        onChange={set("phone")}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label htmlFor="nid" className={labelClass}>
                        NID number{" "}
                        <span className="font-medium text-stone-500 dark:text-slate-400">(for verification)</span>
                      </label>
                      <input
                        id="nid"
                        type="text"
                        placeholder="10, 13 or 17 digits"
                        value={form.nid}
                        onChange={set("nid")}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label htmlFor="avatarUrl" className={labelClass}>
                        Photo URL <span className="font-medium text-stone-500 dark:text-slate-400">(optional)</span>
                      </label>
                      <input
                        id="avatarUrl"
                        type="url"
                        placeholder="https://…"
                        value={form.avatarUrl}
                        onChange={set("avatarUrl")}
                        className={inputClass}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor="company" className={labelClass}>
                        Company / organisation{" "}
                        <span className="font-medium text-stone-500 dark:text-slate-400">(optional)</span>
                      </label>
                      <input
                        id="company"
                        type="text"
                        value={form.company}
                        onChange={set("company")}
                        className={inputClass}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor="bio" className={labelClass}>
                        About you <span className="font-medium text-stone-500 dark:text-slate-400">(optional)</span>
                      </label>
                      <textarea
                        id="bio"
                        rows={3}
                        maxLength={500}
                        placeholder="A few lines about yourself and what you're planning to build."
                        value={form.bio}
                        onChange={set("bio")}
                        className={inputClass}
                      />
                    </div>
                  </div>
                  </div>
                </section>

                <section className={sectionClass}>
                  <div className="relative z-10">
                  <h2 className="text-lg font-bold">Project details</h2>
                  <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">
                    Helps architects and engineers understand your build before you post a brief.
                  </p>

                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="landAreaKatha" className={labelClass}>
                        Land area (katha)
                      </label>
                      <input
                        id="landAreaKatha"
                        type="number"
                        min={0}
                        step="any"
                        placeholder="e.g. 5"
                        value={form.landAreaKatha}
                        onChange={set("landAreaKatha")}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label htmlFor="buildingType" className={labelClass}>
                        Building type
                      </label>
                      <select
                        id="buildingType"
                        value={form.buildingType}
                        onChange={set("buildingType")}
                        className={inputClass}
                      >
                        <option value="">Not decided yet</option>
                        <option value="RESIDENTIAL">Residential</option>
                        <option value="COMMERCIAL">Commercial</option>
                        <option value="MIXED_USE">Mixed use</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="budgetMinBdt" className={labelClass}>
                        Budget from (BDT)
                      </label>
                      <input
                        id="budgetMinBdt"
                        type="number"
                        min={0}
                        placeholder="e.g. 5000000"
                        value={form.budgetMinBdt}
                        onChange={set("budgetMinBdt")}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label htmlFor="budgetMaxBdt" className={labelClass}>
                        Budget up to (BDT)
                      </label>
                      <input
                        id="budgetMaxBdt"
                        type="number"
                        min={0}
                        placeholder="e.g. 12000000"
                        value={form.budgetMaxBdt}
                        onChange={set("budgetMaxBdt")}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label htmlFor="floors" className={labelClass}>
                        Planned floors
                      </label>
                      <input
                        id="floors"
                        type="number"
                        min={0}
                        placeholder="e.g. 6"
                        value={form.floors}
                        onChange={set("floors")}
                        className={inputClass}
                      />
                    </div>
                  </div>
                  </div>
                </section>

                {error && (
                  <p className="rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
                    {error}
                  </p>
                )}
                {saved && (
                  <p className="rounded-xl bg-emerald-100 px-4 py-2.5 text-sm font-medium text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300">
                    Profile saved.
                  </p>
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="self-start rounded-full bg-amber-400 px-8 py-3 text-sm font-bold text-stone-950 shadow-lg transition hover:scale-[1.02] hover:bg-amber-300 disabled:scale-100 disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
