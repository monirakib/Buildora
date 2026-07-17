"use client";

import { useEffect, useState } from "react";
import { DocumentCategory, type ProjectDocument } from "@buildora/shared";
import { uploadImage, uploadModel } from "@/lib/api";
import { addProjectDocument, deleteProjectDocument, listProjectDocuments } from "@/lib/apiProjects";
import { formatDate } from "@/components/app/projectStatus";
import { ModelViewerModal } from "./ModelViewerModal";

const inputClass =
  "block w-full rounded-xl border border-stone-300/80 bg-white/70 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 backdrop-blur transition outline-none focus:border-amber-500 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-white/10";

const cardClass =
  "rounded-3xl border border-white/40 bg-white/40 p-5 shadow-xl shadow-black/5 backdrop-blur-xl sm:p-6 dark:border-white/10 dark:bg-white/5";

const categoryLabels: Record<DocumentCategory, string> = {
  [DocumentCategory.DESIGN]: "Design",
  [DocumentCategory.MODEL_3D]: "3D Model",
  [DocumentCategory.PERMIT]: "Permit",
  [DocumentCategory.CONTRACT]: "Contract",
  [DocumentCategory.SITE]: "Site",
  [DocumentCategory.OTHER]: "Other",
};

/**
 * The project's permanent document archive. Files are either images uploaded
 * through the platform or external links (Drive, Dropbox) — so the archive
 * works even before Cloudinary keys are configured.
 */
export function DocumentsSection({
  projectId,
  token,
  userId,
  isOwner,
}: {
  projectId: string;
  token: string;
  userId: string;
  isOwner: boolean;
}) {
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    title: "",
    category: String(DocumentCategory.OTHER),
    fileUrl: "",
  });
  const [uploading, setUploading] = useState(false);
  // Which document is open in the 3D viewer (null = closed).
  const [viewing, setViewing] = useState<ProjectDocument | null>(null);

  const is3d = form.category === String(DocumentCategory.MODEL_3D);

  useEffect(() => {
    (async () => {
      try {
        setDocuments(await listProjectDocuments(token, projectId));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load the archive");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, projectId]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      // The "3D Model" category takes a .glb through the model endpoint;
      // every other category uploads an image.
      const url = is3d ? await uploadModel(token, file) : await uploadImage(token, file);
      setForm((f) => ({ ...f, fileUrl: url }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await addProjectDocument(token, projectId, form);
      setDocuments((list) => [created, ...list]);
      setForm({ title: "", category: String(DocumentCategory.OTHER), fileUrl: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the document");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Remove this document from the archive?")) return;
    setBusy(true);
    setError(null);
    try {
      await deleteProjectDocument(token, projectId, id);
      setDocuments((list) => list.filter((d) => d.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove the document");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="text-xl font-extrabold tracking-tight">Document archive</h2>

      <div className={`mt-4 ${cardClass}`}>
        {error && (
          <p className="mb-4 rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-medium text-rose-800 dark:bg-rose-400/15 dark:text-rose-300">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-stone-500 dark:text-slate-500">Loading…</p>
        ) : documents.length === 0 ? (
          <p className="text-sm text-stone-600 dark:text-slate-400">
            Nothing filed yet. Designs, permits, receipts, and site photos all live here — the
            project&apos;s permanent record.
          </p>
        ) : (
          <ul className="divide-y divide-black/10 dark:divide-white/10">
            {documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <a
                    href={d.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold hover:text-amber-600 dark:hover:text-amber-400"
                  >
                    {d.title} ↗
                  </a>
                  <p className="text-xs text-stone-500 dark:text-slate-500">
                    {categoryLabels[d.category]} · {d.uploader.name} · {formatDate(d.createdAt)}
                  </p>
                </div>
                {d.category === DocumentCategory.MODEL_3D && (
                  <button
                    type="button"
                    onClick={() => setViewing(d)}
                    className="shrink-0 rounded-full bg-amber-400 px-4 py-1.5 text-xs font-bold text-stone-950 transition hover:bg-amber-300"
                  >
                    View in 3D
                  </button>
                )}
                {(isOwner || d.uploader.id === userId) && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => remove(d.id)}
                    className="shrink-0 text-xs font-semibold text-rose-600 underline underline-offset-2 hover:text-rose-500 disabled:opacity-60 dark:text-rose-400"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={add} className="mt-5 border-t border-black/10 pt-5 dark:border-white/10">
          <p className="text-sm font-bold">Add a document</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
              placeholder="Title, e.g. Approved floor plan"
              className={inputClass}
            />
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className={inputClass}
              aria-label="Category"
            >
              {Object.values(DocumentCategory).map((c) => (
                <option key={c} value={c}>
                  {categoryLabels[c]}
                </option>
              ))}
            </select>
            <input
              type="url"
              value={form.fileUrl}
              onChange={(e) => setForm((f) => ({ ...f, fileUrl: e.target.value }))}
              required
              placeholder={is3d ? "Upload a .glb model →" : "Paste a link, or upload an image →"}
              className={`${inputClass} sm:col-span-1`}
            />
            <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-stone-400/60 px-4 py-2.5 text-sm font-semibold text-stone-600 transition hover:border-amber-500 hover:text-amber-600 dark:border-white/25 dark:text-slate-300">
              {uploading ? "Uploading…" : is3d ? "Upload 3D model (.glb)" : "Upload image"}
              <input
                type="file"
                accept={is3d ? ".glb,.gltf" : "image/*"}
                onChange={handleUpload}
                className="hidden"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={busy || uploading}
            className="mt-3 rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-300 disabled:opacity-60"
          >
            {busy ? "Filing…" : "File document"}
          </button>
        </form>
      </div>

      {/* Full-screen 3D viewer for the selected model document */}
      {viewing && (
        <ModelViewerModal
          url={viewing.fileUrl}
          title={viewing.title}
          onClose={() => setViewing(null)}
        />
      )}
    </section>
  );
}
