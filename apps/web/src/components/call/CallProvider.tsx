"use client";

import { useEffect } from "react";
import { Mic, MicOff, Phone, PhoneOff } from "lucide-react";
import type { UserRole } from "@buildora/shared";
import { useCall } from "@/store/useCall";
import { useSession } from "@/store/useSession";

const roleLabels: Record<string, string> = {
  LAND_OWNER: "Land owner",
  ARCHITECT: "Architect",
  STRUCTURAL_ENGINEER: "Structural engineer",
  CONTRACTOR: "Contractor",
  SUPPLIER: "Supplier",
  ADMIN: "Supervisor",
};

function roleLabel(role: UserRole) {
  return roleLabels[role] ?? role;
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * A live audio-level bar. "You" proves your mic is capturing; the peer's bar
 * proves their audio is reaching you. A flat bar while that side is talking
 * pinpoints where a one-way-audio problem is.
 */
function LevelMeter({ label, level, muted }: { label: string; level: number; muted?: boolean }) {
  const pct = Math.round(Math.min(1, level) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 truncate text-xs font-medium text-stone-500 dark:text-slate-400">
        {label}
      </span>
      <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-emerald-500 transition-[width] duration-100"
          style={{ width: muted ? "0%" : `${pct}%` }}
        />
      </span>
      {muted && <span className="text-[10px] font-semibold text-rose-500">muted</span>}
    </div>
  );
}

/**
 * Connects the calling socket whenever someone is signed in, and renders the
 * global call UI (incoming ring, outgoing ring, and the in-call panel). Mounted
 * once in the root layout so a call can come in on any page.
 */
export function CallProvider() {
  const token = useSession((s) => s.token);
  const connect = useCall((s) => s.connect);
  const disconnect = useCall((s) => s.disconnect);
  const attachRemoteAudio = useCall((s) => s.attachRemoteAudio);

  useEffect(() => {
    if (!token) return;
    connect(token);
    return () => disconnect();
  }, [token, connect, disconnect]);

  return (
    <>
      {/* The remote party's voice plays here. A real, mounted <audio autoplay>
          element is far more reliable than a detached Audio() object. */}
      <audio ref={attachRemoteAudio} autoPlay className="hidden" />
      <CallOverlay />
    </>
  );
}

function CallOverlay() {
  const phase = useCall((s) => s.phase);
  const peer = useCall((s) => s.peer);
  const muted = useCall((s) => s.muted);
  const durationSec = useCall((s) => s.durationSec);
  const notice = useCall((s) => s.notice);
  const localLevel = useCall((s) => s.localLevel);
  const remoteLevel = useCall((s) => s.remoteLevel);

  const accept = useCall((s) => s.accept);
  const reject = useCall((s) => s.reject);
  const hangup = useCall((s) => s.hangup);
  const toggleMute = useCall((s) => s.toggleMute);

  // A brief toast after a call ends ("Call declined", etc.).
  if (phase === "idle") {
    if (!notice) return null;
    return (
      <div className="fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
        <p className="rounded-full bg-stone-900/90 px-5 py-2.5 text-sm font-medium text-white shadow-lg backdrop-blur dark:bg-white/15">
          {notice}
        </p>
      </div>
    );
  }

  if (!peer) return null;

  const statusText =
    phase === "incoming"
      ? "Incoming call"
      : phase === "outgoing"
        ? "Calling…"
        : phase === "connecting"
          ? "Connecting…"
          : formatDuration(durationSec);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-stone-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl border border-white/40 bg-white/80 p-8 text-center shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-[#0b1220]/90">
        <span
          className={`mx-auto grid h-24 w-24 place-items-center rounded-full bg-amber-400 text-4xl font-extrabold text-stone-950 ${
            phase === "incoming" || phase === "outgoing" ? "animate-pulse" : ""
          }`}
        >
          {peer.name[0]?.toUpperCase()}
        </span>

        <h2 className="mt-5 text-2xl font-extrabold tracking-tight">{peer.name}</h2>
        <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">{roleLabel(peer.role)}</p>
        <p className="mt-4 text-sm font-semibold tabular-nums text-amber-600 dark:text-amber-400">
          {statusText}
        </p>

        {(phase === "connected" || phase === "connecting") && (
          <div className="mt-6 space-y-2 text-left">
            <LevelMeter label="You" level={localLevel} muted={muted} />
            <LevelMeter label={peer.name} level={remoteLevel} />
          </div>
        )}

        <div className="mt-8 flex items-center justify-center gap-4">
          {phase === "incoming" ? (
            <>
              <button
                type="button"
                onClick={reject}
                className="grid h-14 w-14 place-items-center rounded-full bg-rose-500 text-white shadow-lg transition hover:bg-rose-400"
                aria-label="Decline call"
              >
                <PhoneOff className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={accept}
                className="grid h-14 w-14 place-items-center rounded-full bg-emerald-500 text-white shadow-lg transition hover:bg-emerald-400"
                aria-label="Accept call"
              >
                <Phone className="h-6 w-6" />
              </button>
            </>
          ) : (
            <>
              {(phase === "connected" || phase === "connecting") && (
                <button
                  type="button"
                  onClick={toggleMute}
                  className={`grid h-14 w-14 place-items-center rounded-full shadow-lg transition ${
                    muted
                      ? "bg-stone-900 text-white hover:bg-stone-700 dark:bg-white/20"
                      : "bg-black/10 text-stone-800 hover:bg-black/15 dark:bg-white/10 dark:text-slate-100"
                  }`}
                  aria-label={muted ? "Unmute" : "Mute"}
                >
                  {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                </button>
              )}
              <button
                type="button"
                onClick={hangup}
                className="grid h-14 w-14 place-items-center rounded-full bg-rose-500 text-white shadow-lg transition hover:bg-rose-400"
                aria-label="End call"
              >
                <PhoneOff className="h-6 w-6" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
