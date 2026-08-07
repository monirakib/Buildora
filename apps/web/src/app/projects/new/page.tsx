"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BuildingType, UserRole, type DapZone, type PlotLocation } from "@buildora/shared";
import { uploadImage } from "@/lib/api";
import { createProject } from "@/lib/apiProjects";
import { useSession } from "@/store/useSession";
import { Navbar } from "@/components/landing/Navbar";
import { PlotMapPicker } from "@/components/project/PlotMapPicker";
import { DapZoneCard } from "@/components/project/DapZoneCard";
import { surfaceBodyClass, surfaceClass } from "@/components/ui/surface";

const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10";

const labelClass = "mb-1.5 block text-sm font-semibold";

const optionalTag = (
  <span className="font-medium text-stone-500 dark:text-slate-400">(optional)</span>
);

/**
 * Form section card. Pads its sides and foot only — SectionHeading supplies the
 * space at the top, because it runs edge to edge to draw its divider.
 */
const sectionClass = `${surfaceClass} px-4 pb-4 sm:px-5 sm:pb-5`;

/** A panel with no heading, so it pads all four sides itself. */
const panelClass = `${surfaceClass} ${surfaceBodyClass}`;

const buildingTypes = [
  { value: BuildingType.RESIDENTIAL, label: "Residential", hint: "Family homes & apartments" },
  { value: BuildingType.COMMERCIAL, label: "Commercial", hint: "Offices, shops, warehouses" },
  { value: BuildingType.MIXED_USE, label: "Mixed use", hint: "Shops below, homes above" },
];

const facings = ["North", "South", "East", "West", "North-East corner", "North-West corner", "South-East corner", "South-West corner"];

const styles = ["Modern", "Contemporary", "Minimalist", "Traditional", "Duplex", "No preference"];

const timelines = ["Immediately", "Within 3 months", "Within 6 months", "Within a year", "Just exploring"];

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
  roadWidthFt: "",
  plotFacing: "",
  existingStructure: false,
  soilTestDone: false,
  unitsPerFloor: "",
  bedroomsPerUnit: "",
  parkingSpaces: "",
  hasLift: false,
  hasBasement: false,
  hasRooftopAmenities: false,
  designStyle: "",
  timeline: "",
  ownershipDocsReady: false,
  photoUrls: [] as string[],
  location: null as PlotLocation | null,
};

type FormState = typeof emptyForm;

/**
 * Numbered heading for each form section, styled as the card's header strip.
 *
 * The negative margins cancel the card's own side padding so the hairline
 * divider reaches both edges — that divider is what separates "header" from
 * "content" instead of leaving one undifferentiated box.
 */
function SectionHeading({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div className="-mx-4 mb-4 flex items-start gap-3 border-b border-black/5 px-4 py-3.5 sm:-mx-5 sm:mb-5 sm:px-5 dark:border-white/10">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-stone-900 text-xs font-extrabold text-amber-400 dark:bg-amber-400 dark:text-stone-950">
        {n}
      </span>
      <div className="min-w-0">
        <h2 className="text-sm font-extrabold tracking-tight">{title}</h2>
        <p className="mt-0.5 text-xs text-stone-500 dark:text-slate-400">{sub}</p>
      </div>
    </div>
  );
}

/** Pill toggle for yes/no extras — pressed state styled like the chips. */
function Toggle({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
        on
          ? "bg-stone-900 text-white dark:bg-amber-400 dark:text-stone-950"
          : "border border-stone-300 text-stone-600 hover:border-amber-500 hover:text-amber-600 dark:border-white/15 dark:text-slate-300 dark:hover:border-amber-400"
      }`}
    >
      {on ? "✓ " : ""}
      {label}
    </button>
  );
}

/** "৳1,50,00,000" style formatting for the live preview. */
function bdt(v: string) {
  const n = Number(v);
  return n > 0 ? `৳${n.toLocaleString("en-IN")}` : null;
}

export default function NewProjectPage() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const token = useSession((s) => s.token);

  const [form, setForm] = useState<FormState>(emptyForm);
  // The DAP zone matched to the plot's area. The card below fetches it; the
  // page keeps it so the sticky preview can show it while section 3 is filled in.
  const [dapZone, setDapZone] = useState<DapZone | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

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

  const flip = (field: keyof FormState) => () =>
    setForm((f) => ({ ...f, [field]: !f[field] }));

  // ---- What the map hands back ----
  // Both of these overwrite the typed fields, because filling them in is the
  // whole point of picking on the map. They stay editable afterwards.

  const takeMapLocation = useCallback(
    (location: PlotLocation | null) => setForm((f) => ({ ...f, location })),
    []
  );

  const takeMapAddress = useCallback((found: { formattedAddress: string; areaName?: string }) => {
    // OpenStreetMap's address runs all the way out to "Bangladesh"; the first
    // two parts are the house-and-road bit that belongs in the address field.
    const shortAddress = found.formattedAddress.split(",").slice(0, 2).join(",").trim();
    setForm((f) => ({
      ...f,
      address: shortAddress || f.address,
      areaName: found.areaName ?? f.areaName,
    }));
  }, []);

  const takeMapArea = useCallback(
    (katha: number) => setForm((f) => ({ ...f, landAreaKatha: katha.toFixed(2) })),
    []
  );

  async function addPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !token || form.photoUrls.length >= 6) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadImage(token, file);
      setForm((f) => ({ ...f, photoUrls: [...f.photoUrls, url] }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Photo upload failed");
    } finally {
      setUploading(false);
    }
  }

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

  // Completeness meter: required fields count double, extras count once.
  const required = [form.title, form.description, form.address, form.areaName, form.landAreaKatha, form.buildingType, form.floors];
  const extras = [form.budgetMinBdt || form.budgetMaxBdt, form.roadWidthFt, form.plotFacing, form.unitsPerFloor, form.parkingSpaces, form.designStyle, form.timeline, form.photoUrls.length > 0 ? "y" : "", form.location ? "y" : ""];
  const score =
    required.filter(Boolean).length * 2 + extras.filter(Boolean).length;
  const completeness = Math.round((score / (required.length * 2 + extras.length)) * 100);

  // Same check the zone card makes, repeated in the preview so it stays visible
  // while the floors field itself is being filled in further down the form.
  const overZoneFloors =
    !!dapZone?.maxFloors && (Number(form.floors) || 0) > dapZone.maxFloors;

  const amenities = [
    form.hasLift && "Lift",
    form.hasBasement && "Basement",
    form.hasRooftopAmenities && "Rooftop",
    form.parkingSpaces && `${form.parkingSpaces} parking`,
  ].filter(Boolean) as string[];

  const budgetLine =
    bdt(form.budgetMinBdt) && bdt(form.budgetMaxBdt)
      ? `${bdt(form.budgetMinBdt)} – ${bdt(form.budgetMaxBdt)}`
      : bdt(form.budgetMinBdt)
        ? `From ${bdt(form.budgetMinBdt)}`
        : bdt(form.budgetMaxBdt)
          ? `Up to ${bdt(form.budgetMaxBdt)}`
          : null;

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1 px-5 pt-28 pb-16 sm:px-8">
        <div className="mx-auto w-full max-w-6xl">
          <p className="text-sm font-bold tracking-[0.2em] text-amber-600 uppercase dark:text-amber-400">
            New project
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Describe what you want to build
          </h1>
          <p className="mt-3 max-w-2xl text-stone-600 dark:text-slate-400">
            Verified architects will read this brief and send you proposals with their fees. The
            more you tell them, the sharper their proposals — and the fewer surprises later.
          </p>

          <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
            {/* ---------------- The form ---------------- */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit(true);
              }}
              className="flex flex-col gap-6"
            >
              {/* 1 — The essentials */}
              <section className={sectionClass}>
                <SectionHeading
                  n={1}
                  title="The essentials"
                  sub="A title architects can scan, and the story of what you want."
                />
                <div className="relative z-10 grid gap-4">
                  <div>
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
                  <div>
                    <label htmlFor="description" className={labelClass}>
                      What do you have in mind?
                    </label>
                    <textarea
                      id="description"
                      value={form.description}
                      onChange={set("description")}
                      rows={5}
                      placeholder="Who will live or work here, the feel you want, must-haves, things you've seen and loved…"
                      required
                      minLength={30}
                      className={inputClass}
                    />
                  </div>
                </div>
              </section>

              {/* 2 — The plot */}
              <section className={sectionClass}>
                <SectionHeading
                  n={2}
                  title="The plot"
                  sub="Where it is and what's on it — road width decides how tall you can build."
                />
                <div className="relative z-10 grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <span className={labelClass}>
                      Find the plot on the map {optionalTag}
                    </span>
                    <PlotMapPicker
                      value={form.location}
                      onChange={takeMapLocation}
                      onAddress={takeMapAddress}
                      onAreaKatha={takeMapArea}
                    />
                    <p className="mt-1.5 text-xs font-medium text-stone-500 dark:text-slate-400">
                      Dropping a pin fills in the address and area below, and tracing the outline
                      works out the land size. Correct any of them by hand if you know better.
                    </p>
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
                      // "any" rather than 0.5: an outline traced on the map
                      // measures something like 4.32 katha, and a 0.5 step
                      // would make the browser reject it as invalid.
                      step="any"
                      value={form.landAreaKatha}
                      onChange={set("landAreaKatha")}
                      placeholder="5"
                      required
                      className={inputClass}
                    />
                  </div>
                  {/* Sits under Area and Land size because it reads both. */}
                  <div className="sm:col-span-2">
                    <DapZoneCard
                      areaName={form.areaName}
                      landAreaKatha={form.landAreaKatha}
                      floors={form.floors}
                      buildingType={form.buildingType}
                      onZone={setDapZone}
                    />
                  </div>
                  <div>
                    <label htmlFor="roadWidthFt" className={labelClass}>
                      Front road width (ft) {optionalTag}
                    </label>
                    <input
                      id="roadWidthFt"
                      type="number"
                      min="1"
                      max="200"
                      value={form.roadWidthFt}
                      onChange={set("roadWidthFt")}
                      placeholder="20"
                      className={inputClass}
                    />
                    <p className="mt-1.5 text-xs font-medium text-stone-500 dark:text-slate-400">
                      RAJUK allows more floors on wider roads.
                    </p>
                  </div>
                  <div>
                    <label htmlFor="plotFacing" className={labelClass}>
                      Plot facing {optionalTag}
                    </label>
                    <select
                      id="plotFacing"
                      value={form.plotFacing}
                      onChange={set("plotFacing")}
                      className={inputClass}
                    >
                      <option value="">Choose…</option>
                      {facings.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-wrap items-end gap-2 pb-1">
                    <Toggle
                      label="Old structure to demolish"
                      on={form.existingStructure}
                      onClick={flip("existingStructure")}
                    />
                    <Toggle
                      label="Soil test done"
                      on={form.soilTestDone}
                      onClick={flip("soilTestDone")}
                    />
                  </div>
                </div>
              </section>

              {/* 3 — The building */}
              <section className={sectionClass}>
                <SectionHeading
                  n={3}
                  title="The building"
                  sub="Shape and size — every field here sharpens the cost estimate."
                />
                <div className="relative z-10 grid gap-4">
                  {/* Building type as radio cards */}
                  <div>
                    <span className={labelClass}>Building type</span>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {buildingTypes.map((t) => (
                        <label
                          key={t.value}
                          className="cursor-pointer rounded-xl border border-stone-300/80 bg-white/60 px-4 py-3 backdrop-blur transition select-none hover:border-stone-400 has-checked:border-amber-500 has-checked:bg-amber-400/15 has-focus-visible:ring-2 has-focus-visible:ring-amber-400/40 dark:border-white/15 dark:bg-white/5 dark:hover:border-white/30 dark:has-checked:border-amber-400 dark:has-checked:bg-amber-400/10"
                        >
                          <input
                            type="radio"
                            name="buildingType"
                            required
                            value={t.value}
                            checked={form.buildingType === t.value}
                            onChange={set("buildingType")}
                            className="sr-only"
                          />
                          <span className="block text-sm font-bold">{t.label}</span>
                          <span className="mt-0.5 block text-xs text-stone-500 dark:text-slate-400">
                            {t.hint}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-4">
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
                      <label htmlFor="unitsPerFloor" className={labelClass}>
                        Units / floor {optionalTag}
                      </label>
                      <input
                        id="unitsPerFloor"
                        type="number"
                        min="1"
                        max="20"
                        value={form.unitsPerFloor}
                        onChange={set("unitsPerFloor")}
                        placeholder="2"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label htmlFor="bedroomsPerUnit" className={labelClass}>
                        Beds / unit {optionalTag}
                      </label>
                      <input
                        id="bedroomsPerUnit"
                        type="number"
                        min="1"
                        max="20"
                        value={form.bedroomsPerUnit}
                        onChange={set("bedroomsPerUnit")}
                        placeholder="3"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label htmlFor="parkingSpaces" className={labelClass}>
                        Parking {optionalTag}
                      </label>
                      <input
                        id="parkingSpaces"
                        type="number"
                        min="0"
                        max="200"
                        value={form.parkingSpaces}
                        onChange={set("parkingSpaces")}
                        placeholder="4"
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div>
                    <span className={labelClass}>Extras</span>
                    <div className="flex flex-wrap gap-2">
                      <Toggle label="Lift" on={form.hasLift} onClick={flip("hasLift")} />
                      <Toggle
                        label="Basement"
                        on={form.hasBasement}
                        onClick={flip("hasBasement")}
                      />
                      <Toggle
                        label="Rooftop garden / amenities"
                        on={form.hasRooftopAmenities}
                        onClick={flip("hasRooftopAmenities")}
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* 4 — Style, budget & timing */}
              <section className={sectionClass}>
                <SectionHeading
                  n={4}
                  title="Style, budget & timing"
                  sub="Honest budgets get honest proposals."
                />
                <div className="relative z-10 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="designStyle" className={labelClass}>
                      Design style {optionalTag}
                    </label>
                    <select
                      id="designStyle"
                      value={form.designStyle}
                      onChange={set("designStyle")}
                      className={inputClass}
                    >
                      <option value="">Choose…</option>
                      {styles.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="timeline" className={labelClass}>
                      When do you want to start? {optionalTag}
                    </label>
                    <select
                      id="timeline"
                      value={form.timeline}
                      onChange={set("timeline")}
                      className={inputClass}
                    >
                      <option value="">Choose…</option>
                      {timelines.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="budgetMinBdt" className={labelClass}>
                      Budget from (BDT) {optionalTag}
                    </label>
                    <input
                      id="budgetMinBdt"
                      type="number"
                      min="0"
                      value={form.budgetMinBdt}
                      onChange={set("budgetMinBdt")}
                      placeholder="10000000"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="budgetMaxBdt" className={labelClass}>
                      Budget up to (BDT) {optionalTag}
                    </label>
                    <input
                      id="budgetMaxBdt"
                      type="number"
                      min="0"
                      value={form.budgetMaxBdt}
                      onChange={set("budgetMaxBdt")}
                      placeholder="20000000"
                      className={inputClass}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Toggle
                      label="Land ownership documents are ready"
                      on={form.ownershipDocsReady}
                      onClick={flip("ownershipDocsReady")}
                    />
                  </div>
                </div>
              </section>

              {/* 5 — Plot photos */}
              <section className={sectionClass}>
                <SectionHeading
                  n={5}
                  title="Plot photos"
                  sub="Up to six photos of the land — architects propose better when they can see it."
                />
                <div className="relative z-10">
                  <div className="flex flex-wrap gap-3">
                    {form.photoUrls.map((url) => (
                      <div key={url} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary-hosted */}
                        <img
                          src={url}
                          alt="Plot photo"
                          className="h-24 w-32 rounded-xl object-cover"
                        />
                        <button
                          type="button"
                          aria-label="Remove photo"
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              photoUrls: f.photoUrls.filter((u) => u !== url),
                            }))
                          }
                          className="absolute -top-1.5 -right-1.5 grid h-5 w-5 place-items-center rounded-full bg-stone-900 text-xs font-bold text-white shadow dark:bg-white dark:text-stone-900"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {form.photoUrls.length < 6 && (
                      <label className="flex h-24 w-32 cursor-pointer items-center justify-center rounded-xl border border-dashed border-stone-400/60 text-sm font-semibold text-stone-600 transition hover:border-amber-500 hover:text-amber-600 dark:border-white/25 dark:text-slate-300">
                        {uploading ? "Uploading…" : "+ Add photo"}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={addPhoto}
                          className="hidden"
                        />
                      </label>
                    )}
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
                  disabled={saving || uploading}
                  className="rounded-full bg-amber-400 px-7 py-3 text-sm font-bold text-stone-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Posting…" : "Post brief to architects"}
                </button>
                <button
                  type="button"
                  disabled={saving || uploading}
                  onClick={() => submit(false)}
                  className="rounded-full border border-stone-300 px-7 py-3 text-sm font-bold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/10"
                >
                  Save as draft
                </button>
              </div>
            </form>

            {/* ---------------- Live preview ---------------- */}
            <aside className="lg:sticky lg:top-28">
              <div className={panelClass}>
                <div className="relative z-10">
                  <p className="text-xs font-bold tracking-[0.16em] text-stone-500 uppercase dark:text-slate-400">
                    What architects will see
                  </p>

                  <p className="mt-3 text-lg leading-snug font-extrabold tracking-tight">
                    {form.title || "Your project title"}
                  </p>
                  <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
                    {form.areaName || "Area"}
                    {form.landAreaKatha ? ` · ${form.landAreaKatha} katha` : ""}
                    {form.plotFacing ? ` · ${form.plotFacing} facing` : ""}
                  </p>
                  {form.location && (
                    <p className="mt-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      📍 Pinned on the map
                      {form.location.boundary ? " · outline traced" : ""}
                    </p>
                  )}
                  {/* The zone card lives up in section 2, so repeat its limits
                      here — this panel stays in view while floors are typed. */}
                  {dapZone && (
                    <p
                      className={`mt-1 text-xs font-semibold ${
                        overZoneFloors
                          ? "text-rose-600 dark:text-rose-400"
                          : "text-stone-500 dark:text-slate-400"
                      }`}
                    >
                      {`DAP zone ${dapZone.zoneCode} · FAR ${dapZone.maxFar}`}
                      {dapZone.maxFloors ? ` · max ${dapZone.maxFloors} floors` : ""}
                      {overZoneFloors ? ` — your ${form.floors} exceed it` : ""}
                    </p>
                  )}

                  {/* Fact chips appear as the form fills in */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {form.buildingType && (
                      <span className="rounded-full bg-amber-400/20 px-2.5 py-1 text-xs font-bold text-amber-700 dark:text-amber-300">
                        {buildingTypes.find((t) => t.value === form.buildingType)?.label}
                      </span>
                    )}
                    {form.floors && (
                      <span className="rounded-full bg-stone-500/10 px-2.5 py-1 text-xs font-semibold text-stone-600 dark:bg-white/10 dark:text-slate-300">
                        {form.floors} floors
                      </span>
                    )}
                    {form.unitsPerFloor && (
                      <span className="rounded-full bg-stone-500/10 px-2.5 py-1 text-xs font-semibold text-stone-600 dark:bg-white/10 dark:text-slate-300">
                        {form.unitsPerFloor} units/floor
                      </span>
                    )}
                    {amenities.map((a) => (
                      <span
                        key={a}
                        className="rounded-full bg-stone-500/10 px-2.5 py-1 text-xs font-semibold text-stone-600 dark:bg-white/10 dark:text-slate-300"
                      >
                        {a}
                      </span>
                    ))}
                    {form.designStyle && (
                      <span className="rounded-full bg-stone-500/10 px-2.5 py-1 text-xs font-semibold text-stone-600 dark:bg-white/10 dark:text-slate-300">
                        {form.designStyle}
                      </span>
                    )}
                  </div>

                  {budgetLine && (
                    <p className="mt-3 text-sm font-bold text-amber-600 dark:text-amber-400">
                      {budgetLine}
                    </p>
                  )}
                  {form.timeline && (
                    <p className="mt-1 text-xs font-semibold text-stone-500 dark:text-slate-400">
                      Starting: {form.timeline}
                    </p>
                  )}

                  {form.photoUrls.length > 0 && (
                    <div className="mt-3 flex gap-1.5">
                      {form.photoUrls.slice(0, 4).map((url) => (
                        /* eslint-disable-next-line @next/next/no-img-element -- Cloudinary-hosted */
                        <img
                          key={url}
                          src={url}
                          alt=""
                          className="h-12 w-16 rounded-lg object-cover"
                        />
                      ))}
                    </div>
                  )}

                  {/* Completeness meter */}
                  <div className="mt-6 border-t border-stone-200/70 pt-4 dark:border-white/10">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-stone-500 dark:text-slate-400">Brief completeness</span>
                      <span className={completeness >= 70 ? "text-emerald-600 dark:text-emerald-400" : "text-stone-500 dark:text-slate-400"}>
                        {completeness}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 rounded-full bg-stone-200 dark:bg-white/10">
                      <div
                        style={{ width: `${completeness}%` }}
                        className="h-2 rounded-full bg-amber-500 transition-all duration-500 dark:bg-amber-400"
                      />
                    </div>
                    <p className="mt-2 text-xs text-stone-500 dark:text-slate-500">
                      Complete briefs get sharper proposals, faster.
                    </p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
