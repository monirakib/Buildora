"use client";

import { useRef, useState } from "react";
import { CheckCircle2, ImagePlus, Loader2, X } from "lucide-react";
import { uploadImage } from "@/lib/api";
import { useSession } from "@/store/useSession";

/**
 * Drag-and-drop image upload. Sends the file through the API to Cloudinary
 * and hands the hosted URL back via onChange; empty string clears the value.
 */
export function UploadZone({
  title,
  required,
  value,
  onChange,
  onError,
  disabled,
  compact,
}: {
  title: string;
  required?: boolean;
  /** The currently uploaded image URL, or "". */
  value: string;
  onChange: (url: string) => void;
  onError: (message: string) => void;
  disabled?: boolean;
  /** Smaller drop area for entries inside lists. */
  compact?: boolean;
}) {
  const token = useSession((s) => s.token);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file || !token || disabled) return;
    if (!file.type.startsWith("image/")) {
      onError("Only image files can be uploaded");
      return;
    }
    setBusy(true);
    try {
      onChange(await uploadImage(token, file));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold text-stone-800 dark:text-slate-200">
        {title}
        {required && <span className="ml-1 text-amber-600 dark:text-[#F5B400]">*</span>}
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = ""; // allow re-picking the same file later
          handleFile(f);
        }}
      />

      {value ? (
        <div className="group relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary-hosted */}
          <img
            src={value}
            alt={title}
            className={`rounded-2xl border border-white/40 dark:border-white/10 object-cover ${
              compact ? "h-24 w-36" : "h-36 w-56"
            }`}
          />
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[11px] font-bold text-stone-900 dark:text-white">
            <CheckCircle2 className="h-3 w-3" /> Uploaded
          </span>
          {!disabled && (
            <button
              type="button"
              aria-label={`Remove ${title}`}
              onClick={() => onChange("")}
              className="absolute -top-2 -right-2 grid h-6 w-6 place-items-center rounded-full bg-slate-900 text-stone-900 dark:text-white shadow transition hover:bg-rose-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFile(e.dataTransfer.files?.[0]);
          }}
          className={`group flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed transition-all duration-300 disabled:opacity-50 ${
            compact ? "h-24" : "h-36"
          } ${
            dragging
              ? "scale-[1.01] border-[#F5B400]/70 bg-[#F5B400]/15 shadow-[0_0_40px_rgba(245,180,0,0.2)]"
              : "border-stone-400/60 dark:border-white/25 bg-white/40 dark:bg-white/[0.06] backdrop-blur-xl hover:border-[#F5B400]/50 hover:bg-white/60 dark:hover:bg-white/[0.09] hover:shadow-[0_0_28px_rgba(245,180,0,0.10)]"
          }`}
        >
          {busy ? (
            <Loader2 className="h-6 w-6 animate-spin text-amber-600 dark:text-[#F5B400]" />
          ) : (
            <ImagePlus
              className={`h-6 w-6 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:text-amber-600 dark:group-hover:text-[#F5B400] ${
                dragging ? "-translate-y-0.5 text-amber-600 dark:text-[#F5B400]" : "text-stone-600 dark:text-slate-400"
              }`}
            />
          )}
          <span className="text-xs font-semibold text-stone-600 dark:text-slate-400 transition-colors group-hover:text-stone-700 dark:group-hover:text-slate-300">
            {busy ? "Uploading…" : "Drop an image or click to browse"}
          </span>
        </button>
      )}
    </div>
  );
}
