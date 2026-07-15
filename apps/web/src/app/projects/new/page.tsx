"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BuildingType, UserRole } from "@buildora/shared";
import { createProject } from "@/lib/apiProjects";
import { useSession } from "@/store/useSession";
import { Navbar } from "@/components/landing/Navbar";

const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10";

const labelClass = "mb-1.5 block text-sm font-semibold";

const sectionClass =
  "relative overflow-hidden rounded-3xl border border-white/40 bg-white/30 p-6 shadow-2xl shadow-black/10 backdrop-blur-2xl backdrop-saturate-150 sm:p-8 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-40 before:bg-linear-to-b before:from-white/40 before:to-transparent before:content-[''] dark:border-white/15 dark:bg-white/10 dark:shadow-black/40 dark:before:from-white/15";

const emptyForm = {
  title: "",
  description: "",
  address: "",
  areaName: "",
  landAreaKatha: "",
  buildingType: "",
  floors: "",
  budgetMinBdt: "",
  budgetMaxBdt: "",
};

type FormState = typeof emptyForm;

export default function NewProjectPage() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const token = useSession((s) => s.token);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!mounted) return;
    if (!user || !token) router.replace("/auth");
    else if (user.role !== UserRole.LAND_OWNER) router.replace("/projects");
  }, [mounted, user, token, router]);

  const set =
    (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));

  // One handler for both buttons: "Save draft" keeps it private, "Post brief"
  // publishes it to architects right away.
  async function submit(publish: boolean) {
    if (!token) return;
    setError(null);
    setSaving(true);
    try {
      const project = await createProject(token, { ...form, publish });
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the project");
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1 px-5 pt-28 pb-16 sm:px-8">
        <div className="mx-auto w-full max-w-2xl">
          <p className="text-sm font-bold tracking-[0.2em] text-amber-600 uppercase dark:text-amber-400">
            New project
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Describe what you want to build
          </h1>
          <p className="mt-3 text-stone-600 dark:text-slate-400">
            Verified architects will read this brief and send you proposals with their fees.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(true);
            }}
            className="mt-8 flex flex-col gap-6"
          >
            <section className={sectionClass}>
              <div className="relative z-10 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="title" className={labelClass}>
                    Project title
                  </label>
                  <input
                    id="title"
                    value={form.title}
                    onChange={set("title")}
                    placeholder="6-storey family home in Dhanmondi"
                    required
                    className={inputClass}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="description" className={labelClass}>
                    What do you have in mind?
                  </label>
                  <textarea
                    id="description"
                    value={form.description}
                    onChange={set("description")}
                    rows={5}
                    placeholder="Number of units, parking, style preferences, must-haves…"
                    required
                    className={inputClass}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="address" className={labelClass}>
                    Plot address
                  </label>
                  <input
                    id="address"
                    value={form.address}
                    onChange={set("address")}
                    placeholder="House 12, Road 5"
                    required
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="areaName" className={labelClass}>
                    Area
                  </label>
                  <input
                    id="areaName"
                    value={form.areaName}
                    onChange={set("areaName")}
                    placeholder="Dhanmondi"
                    required
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="landAreaKatha" className={labelClass}>
                    Land size (katha)
                  </label>
                  <input
                    id="landAreaKatha"
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={form.landAreaKatha}
                    onChange={set("landAreaKatha")}
                    placeholder="5"
                    required
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
                    required
                    className={inputClass}
                  >
                    <option value="">Choose…</option>
                    <option value={BuildingType.RESIDENTIAL}>Residential</option>
                    <option value={BuildingType.COMMERCIAL}>Commercial</option>
                    <option value={BuildingType.MIXED_USE}>Mixed use</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="floors" className={labelClass}>
                    Floors
                  </label>
                  <input
                    id="floors"
                    type="number"
                    min="1"
                    max="50"
                    value={form.floors}
                    onChange={set("floors")}
                    placeholder="6"
                    required
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="budgetMinBdt" className={labelClass}>
                    Budget from (BDT){" "}
                    <span className="font-medium text-stone-500 dark:text-slate-400">
                      (optional)
                    </span>
                  </label>
                  <input
                    id="budgetMinBdt"
                    type="number"
                    min="0"
                    value={form.budgetMinBdt}
                    onChange={set("budgetMinBdt")}
                    placeholder="1,00,00,000"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="budgetMaxBdt" className={labelClass}>
                    Budget up to (BDT){" "}
                    <span className="font-medium text-stone-500 dark:text-slate-400">
                      (optional)
                    </span>
                  </label>
                  <input
                    id="budgetMaxBdt"
                    type="number"
                    min="0"
                    value={form.budgetMaxBdt}
                    onChange={set("budgetMaxBdt")}
                    placeholder="2,00,00,000"
                    className={inputClass}
                  />
                </div>
              </div>
            </section>

            {error && (
              <p className="rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
                {error}
              </p>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-amber-400 px-7 py-3 text-sm font-bold text-stone-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Posting…" : "Post brief to architects"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => submit(false)}
                className="rounded-full border border-stone-300 px-7 py-3 text-sm font-bold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/10"
              >
                Save as draft
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
