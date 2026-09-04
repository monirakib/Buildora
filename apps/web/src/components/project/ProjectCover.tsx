"use client";

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import type { Project } from "@buildora/shared";
import { uploadImage } from "@/lib/api";
import { setProjectCover } from "@/lib/apiProjects";
import { imageAt } from "@/lib/imageUrl";
import { PlotMapView } from "@/components/project/PlotMapView";
import { toast } from "@/store/useToast";

/**
 * The picture at the top of a project: the owner's cover photograph, or the
 * plot map when there is none yet.
 *
 * The owner changes it in place: pick a file, it uploads to Cloudinary, the
 * project is updated, and the new image crossfades in. Everyone else just
 * sees the picture. A project without a pin and without a cover shows a warm
 * gradient with the title's initial, so the frame is never empty.
 */
export function ProjectCover({
  project,
  token,
  editable,
  onChange,
  className = "",
}: {
  project: Project;
  token?: string | null;
  editable: boolean;
  onChange?: (project: Project) => void;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined) {
    if (!file || !token) return;
    setBusy(true);
    try {
      const url = await uploadImage(token, file);
      const updated = await setProjectCover(token, project.id, url);
      onChange?.(updated);
      toast.success("Cover updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update the cover");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  const hasPin = !!project.location?.lat && !!project.location?.lng;

  return (
    <div
      className={`group relative aspect-[21/9] w-full overflow-hidden rounded-3xl border border-white/50 bg-white/40 shadow-xl shadow-black/5 dark:border-white/10 dark:bg-white/5 ${className}`}
    >
      {project.coverImageUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element -- Cloudinary-hosted */
        <img
          key={project.coverImageUrl}
          src={imageAt(project.coverImageUrl, 1600)}
          alt={`${project.title} cover`}
          className="animate-rise-in h-full w-full object-cover"
        />
      ) : hasPin ? (
        <div className="h-full w-full">
          <PlotMapView location={project.location!} />
        </div>
      ) : (
        <div className="grid h-full w-full place-items-center bg-linear-to-br from-amber-300/50 via-stone-200/60 to-sky-200/50 dark:from-amber-400/20 dark:via-white/5 dark:to-sky-400/10">
          <span className="display-title text-7xl text-stone-900/20 dark:text-white/15">
            {project.title.charAt(0).toUpperCase()}
          </span>
        </div>
      )}

      {editable && token && (
        <>
          <input
            ref={input}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => pick(e.target.files?.[0])}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="btn-secondary absolute right-4 bottom-4 px-4 py-2 text-xs opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-100"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin-smooth" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
            {busy ? "Uploading" : project.coverImageUrl ? "Change cover" : "Add a cover photo"}
          </button>
        </>
      )}
    </div>
  );
}
