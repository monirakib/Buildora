"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import {
  InspectionVerdict,
  MilestoneStatus,
  type BuildContract,
  type Milestone,
  type Project,
} from "@buildora/shared";
import { getProject } from "@/lib/apiProjects";
import { getProjectBuild } from "@/lib/apiBuild";
import { useSession } from "@/store/useSession";
import { formatBdt, formatDate } from "@/components/app/projectStatus";

/**
 * The printable inspection report.
 *
 * An engineer's signed inspection is what releases each escrow tranche, so it
 * is the document people need off the platform — for a bank, for RAJUK, for a
 * file. This page renders the whole chain (every milestone, its checklist,
 * photos, geotag and signature) in a layout built for paper: no navigation, no
 * cards, no dark mode, and page breaks between milestones.
 *
 * It prints through the browser rather than generating a PDF server-side. That
 * needs no dependency, gives the user their own "Save as PDF", and — because it
 * is the same HTML — cannot drift from what the screen shows.
 */
export default function InspectionReportPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const token = useSession((s) => s.token);
  const user = useSession((s) => s.user);

  const [project, setProject] = useState<Project | null>(null);
  const [contract, setContract] = useState<BuildContract | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [p, build] = await Promise.all([
        getProject(token, params.id),
        getProjectBuild(token, params.id).catch(() => null),
      ]);
      setProject(p);
      setContract(build?.contract ?? null);
      setMilestones(build?.milestones ?? []);
    } finally {
      setLoading(false);
    }
  }, [token, params.id]);

  useEffect(() => {
    if (!mounted) return;
    if (!token || !user) {
      router.replace("/auth");
      return;
    }
    load();
  }, [mounted, token, user, router, load]);

  if (!mounted || loading) {
    return <p className="p-10 text-center text-sm text-stone-500">Loading…</p>;
  }
  if (!project) {
    return <p className="p-10 text-center text-sm text-stone-500">Project not found.</p>;
  }

  const inspected = milestones.filter((m) => m.inspections.length > 0);
  const released = milestones.filter((m) => m.status === MilestoneStatus.RELEASED);
  const totalReleased = released.reduce((sum, m) => sum + (m.releasedAmountBdt ?? 0), 0);

  return (
    <div className="report min-h-screen bg-white text-stone-900">
      {/* Screen-only toolbar. `print:hidden` keeps it off the paper. */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-stone-200 bg-white px-6 py-3 print:hidden">
        <Link
          href={`/projects/${project.id}?tab=contractor`}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-stone-600 transition hover:text-stone-900"
        >
          <ArrowLeft className="h-4 w-4" /> Back to project
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-stone-700"
        >
          <Printer className="h-4 w-4" /> Print / Save as PDF
        </button>
      </div>

      <main className="mx-auto max-w-3xl px-8 py-10 print:px-0 print:py-0">
        {/* Letterhead */}
        <header className="border-b-2 border-stone-900 pb-4">
          <p className="text-xs font-bold tracking-[0.2em] uppercase">Buildora</p>
          <h1 className="mt-1 text-2xl font-extrabold">Inspection &amp; Progress Report</h1>
          <p className="mt-2 text-sm">
            <strong>{project.title}</strong>, {project.address}, {project.areaName}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-stone-500">Owner</dt>
              <dd className="font-semibold">{project.owner.name}</dd>
            </div>
            {contract && (
              <>
                <div>
                  <dt className="text-stone-500">Contractor</dt>
                  <dd className="font-semibold">
                    {contract.contractor.company || contract.contractor.name}
                  </dd>
                </div>
                <div>
                  <dt className="text-stone-500">Contract sum</dt>
                  <dd className="font-semibold">{formatBdt(contract.contractSumBdt)}</dd>
                </div>
              </>
            )}
            <div>
              <dt className="text-stone-500">Issued</dt>
              <dd className="font-semibold">{formatDate(new Date().toISOString())}</dd>
            </div>
          </dl>
        </header>

        {!contract ? (
          <p className="mt-8 text-sm text-stone-600">
            No construction contract has been awarded on this project, so there are no inspections
            to report yet.
          </p>
        ) : (
          <>
            {/* Summary */}
            <section className="mt-6">
              <h2 className="text-sm font-extrabold tracking-wider uppercase">Summary</h2>
              <table className="mt-2 w-full border-collapse text-sm">
                <tbody>
                  <tr className="border-b border-stone-200">
                    <td className="py-1.5 text-stone-600">Milestones in schedule</td>
                    <td className="py-1.5 text-right font-semibold">{milestones.length}</td>
                  </tr>
                  <tr className="border-b border-stone-200">
                    <td className="py-1.5 text-stone-600">Inspected</td>
                    <td className="py-1.5 text-right font-semibold">{inspected.length}</td>
                  </tr>
                  <tr className="border-b border-stone-200">
                    <td className="py-1.5 text-stone-600">Released</td>
                    <td className="py-1.5 text-right font-semibold">{released.length}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-stone-600">Paid to contractor (net)</td>
                    <td className="py-1.5 text-right font-semibold">{formatBdt(totalReleased)}</td>
                  </tr>
                </tbody>
              </table>
            </section>

            {/* One block per milestone, each starting a fresh page after the first */}
            {milestones.map((m, index) => (
              <section key={m.id} className={`mt-8 ${index > 0 ? "break-before-page" : ""}`}>
                <div className="flex items-baseline justify-between gap-4 border-b border-stone-300 pb-1">
                  <h2 className="text-base font-extrabold">
                    {m.order}. {m.title}
                  </h2>
                  <span className="text-xs font-bold uppercase">
                    {m.status.replace(/_/g, " ").toLowerCase()}
                  </span>
                </div>

                <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
                  <div>
                    <dt className="text-stone-500">Value</dt>
                    <dd className="font-semibold">
                      {formatBdt(m.amountBdt)} ({m.amountPct}%)
                    </dd>
                  </div>
                  {m.targetDate && (
                    <div>
                      <dt className="text-stone-500">Target</dt>
                      <dd className="font-semibold">{formatDate(m.targetDate)}</dd>
                    </div>
                  )}
                  {m.releasedAt && (
                    <div>
                      <dt className="text-stone-500">Released</dt>
                      <dd className="font-semibold">{formatDate(m.releasedAt)}</dd>
                    </div>
                  )}
                  {m.releasedAmountBdt != null && (
                    <div>
                      <dt className="text-stone-500">Paid (net)</dt>
                      <dd className="font-semibold">{formatBdt(m.releasedAmountBdt)}</dd>
                    </div>
                  )}
                </dl>

                {m.description && <p className="mt-2 text-sm">{m.description}</p>}

                {m.inspections.length === 0 ? (
                  <p className="mt-3 text-sm text-stone-500">Not yet inspected.</p>
                ) : (
                  m.inspections.map((ins) => (
                    <div key={ins.id} className="mt-4 border border-stone-300 p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-bold">
                          {ins.templateName},{" "}
                          <span
                            className={ins.verdict === InspectionVerdict.FAIL ? "text-red-700" : ""}
                          >
                            {ins.verdict.replace(/_/g, " ").toLowerCase()}
                          </span>
                        </p>
                        <p className="text-xs text-stone-500">{formatDate(ins.inspectedAt)}</p>
                      </div>

                      <table className="mt-2 w-full border-collapse text-xs">
                        <tbody>
                          {ins.results.map((r, i) => (
                            <tr key={i} className="border-b border-stone-200">
                              <td className="py-1 pr-2">{r.label}</td>
                              <td className="w-16 py-1 text-right font-bold">
                                {r.passed ? "PASS" : "FAIL"}
                              </td>
                              {r.note && (
                                <td className="w-1/3 py-1 pl-2 text-stone-600">{r.note}</td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {ins.notes && <p className="mt-2 text-xs">{ins.notes}</p>}

                      {/* Geotag — the evidence that the inspector stood on the plot */}
                      {ins.location && (
                        <p className="mt-2 text-xs text-stone-600">
                          Recorded at {ins.location.lat.toFixed(5)}, {ins.location.lng.toFixed(5)}
                          {ins.location.distanceFromPlotM != null &&
                            `, ${Math.round(ins.location.distanceFromPlotM)} m from the plot pin`}
                          {ins.location.address ? ` (${ins.location.address})` : ""}
                        </p>
                      )}

                      {ins.photoUrls.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {ins.photoUrls.map((url) => (
                            /* eslint-disable-next-line @next/next/no-img-element -- Cloudinary-hosted */
                            <img
                              key={url}
                              src={url}
                              alt="Inspection photo"
                              className="h-28 w-40 border border-stone-300 object-cover"
                            />
                          ))}
                        </div>
                      )}

                      <div className="mt-3 border-t border-stone-300 pt-2">
                        <p className="font-serif text-sm italic">{ins.signature}</p>
                        <p className="text-xs text-stone-500">
                          {ins.inspector.name}
                          {ins.inspector.company ? `, ${ins.inspector.company}` : ""}, signing
                          engineer
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </section>
            ))}
          </>
        )}

        <footer className="mt-10 border-t border-stone-300 pt-3 text-xs text-stone-500">
          Generated by Buildora on {new Date().toLocaleString()}. Each inspection above was signed
          by the named engineer at the time shown; escrow was released only against a passing
          inspection.
        </footer>
      </main>

      {/*
        Print rules. `break-before-page` on each milestone keeps one stage per
        sheet, and forcing colours makes the PASS/FAIL column legible on printers
        that drop backgrounds by default.
      */}
      <style jsx global>{`
        @media print {
          @page {
            margin: 16mm;
          }
          body {
            background: #fff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .report img {
            max-height: 28mm;
          }
        }
      `}</style>
    </div>
  );
}
