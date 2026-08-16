"use client";

import { useEffect, useRef, useState } from "react";
import {
  Maximize,
  Mic,
  MicOff,
  Minimize,
  Minimize2,
  MonitorOff,
  MonitorUp,
  Phone,
  PhoneOff,
  Video,
  VideoOff,
} from "lucide-react";
import { CallMedia, type CallPeer, type UserRole } from "@buildora/shared";
import { useCall, type CallPhase } from "@/store/useCall";
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

/** What the call is doing right now — the ring state, or the running timer. */
function statusLabel(phase: CallPhase, durationSec: number, media: CallMedia) {
  const video = media === CallMedia.VIDEO;
  if (phase === "incoming") return video ? "Incoming video call" : "Incoming call";
  if (phase === "outgoing") return "Calling…";
  if (phase === "connecting") return "Connecting…";
  return formatDuration(durationSec);
}

/** One round control button in the in-call bar. */
function ControlButton({
  onClick,
  active,
  danger,
  label,
  children,
}: {
  onClick: () => void;
  /** Highlighted = the thing it controls is currently ON (or muted, for the mic). */
  active?: boolean;
  danger?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const tone = danger
    ? "bg-rose-500 text-white hover:bg-rose-400"
    : active
      ? "bg-stone-900 text-white hover:bg-stone-700 dark:bg-white/25"
      : "bg-black/10 text-stone-800 hover:bg-black/15 dark:bg-white/10 dark:text-slate-100";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`grid h-14 w-14 place-items-center rounded-full shadow-lg transition ${tone}`}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
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
 * The picture part of a call: the other side fills the stage, our own camera or
 * screen sits in the corner. Both <video> elements register themselves with the
 * call store, which points them at the right stream — the elements come and go
 * as the panel opens and closes, but the streams outlive them.
 */
function VideoStage({
  peer,
  remoteOn,
  remoteScreen,
  remoteTrackReady,
  localOn,
  localScreen,
  attachLocal,
  attachRemote,
  containerRef,
  isFullscreen,
  onToggleFullscreen,
  children,
}: {
  peer: CallPeer;
  remoteOn: boolean;
  remoteScreen: boolean;
  /** We actually have their video track, not just their word that it's coming. */
  remoteTrackReady: boolean;
  localOn: boolean;
  localScreen: boolean;
  attachLocal: (el: HTMLVideoElement | null) => void;
  attachRemote: (el: HTMLVideoElement | null) => void;
  /** The element that goes fullscreen — this whole stage, previews included. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  /** Call controls, shown over the video while fullscreen hides the panel's own. */
  children?: React.ReactNode;
}) {
  const showRemote = remoteOn && remoteTrackReady;
  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden bg-stone-950 ${
        // Fullscreen fills the screen, so the 16:9 box and rounded corners go.
        isFullscreen ? "h-full rounded-none" : "aspect-video rounded-2xl"
      }`}
    >
      {/* Muted on purpose: their voice already plays through the <audio>
          element in CallProvider, so an unmuted video would double it up. */}
      <video
        ref={attachRemote}
        autoPlay
        playsInline
        muted
        className={`h-full w-full object-contain ${showRemote ? "" : "hidden"}`}
      />
      {!showRemote && (
        <div className="grid h-full w-full place-items-center text-center">
          <div>
            <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-amber-400 text-3xl font-extrabold text-stone-950">
              {peer.name[0]?.toUpperCase()}
            </span>
            <p className="mt-3 text-sm font-semibold text-white/70">
              {remoteOn ? "Connecting video…" : "Camera off"}
            </p>
          </div>
        </div>
      )}

      {showRemote && remoteScreen && (
        <span className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
          <MonitorUp className="h-3.5 w-3.5" />
          Sharing their screen
        </span>
      )}

      {localOn && (
        <video
          ref={attachLocal}
          autoPlay
          playsInline
          muted
          // Mirrored for the camera (how you expect to see yourself), never for
          // a screen share — mirrored text would be unreadable.
          className={`absolute right-3 bg-stone-900 object-cover shadow-lg ${
            // Lifted clear of the control bar while fullscreen.
            isFullscreen
              ? "bottom-28 h-32 w-52 rounded-2xl border-2 border-white/25"
              : "bottom-3 h-24 w-36 rounded-xl border-2 border-white/25 sm:h-28 sm:w-44"
          } ${localScreen ? "" : "-scale-x-100"}`}
        />
      )}

      {/* Fullscreen is what makes a shared screen actually readable, so the
          button sits on the video itself rather than down in the controls. */}
      <button
        type="button"
        onClick={onToggleFullscreen}
        className="absolute top-3 right-3 grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/80"
        aria-label={isFullscreen ? "Exit full screen" : "Full screen"}
        title={isFullscreen ? "Exit full screen (Esc)" : "Full screen"}
      >
        {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
      </button>

      {/* Fullscreen covers the panel, so the controls come along with it. */}
      {isFullscreen && children && (
        <div className="absolute inset-x-0 bottom-6 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-full bg-black/60 px-4 py-3 shadow-2xl backdrop-blur">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The minimized call — a floating pill (like WhatsApp/Messenger) that stays put
 * while you move around the app, because CallProvider lives in the root layout
 * and the page underneath never unmounts the call. Tapping it reopens the panel;
 * mute and hang up stay reachable without doing so.
 */
function CallPill({
  peer,
  statusText,
  muted,
  canMute,
  sharing,
  video,
  onExpand,
  onToggleMute,
  onHangup,
}: {
  peer: CallPeer;
  statusText: string;
  muted: boolean;
  canMute: boolean;
  /** A screen share is running (either side) — worth calling out while hidden. */
  sharing: boolean;
  /** Any camera is on. */
  video: boolean;
  onExpand: () => void;
  onToggleMute: () => void;
  onHangup: () => void;
}) {
  return (
    <div className="fixed bottom-5 left-5 z-60 flex items-center gap-1 rounded-full border border-white/15 bg-stone-900/95 p-1.5 text-white shadow-2xl shadow-black/40 backdrop-blur">
      <button
        type="button"
        onClick={onExpand}
        className="flex items-center gap-2.5 rounded-full py-0.5 pr-2 pl-0.5 text-left transition hover:bg-white/10"
        aria-label={`Back to the call with ${peer.name}`}
        title="Back to call"
      >
        <span className="relative shrink-0">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-amber-400 text-sm font-extrabold text-stone-950">
            {peer.name[0]?.toUpperCase()}
          </span>
          {/* Pulsing dot = the call is still live, even off-screen. */}
          <span className="absolute -right-0.5 -bottom-0.5 h-3 w-3 animate-pulse rounded-full border-2 border-stone-900 bg-emerald-500" />
        </span>
        <span className="min-w-0">
          <span className="block max-w-28 truncate text-sm leading-tight font-bold sm:max-w-40">
            {peer.name}
          </span>
          <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400">
            {sharing ? (
              <MonitorUp className="h-3 w-3 shrink-0" />
            ) : video ? (
              <Video className="h-3 w-3 shrink-0" />
            ) : null}
            <span className="tabular-nums">{muted ? `${statusText} · muted` : statusText}</span>
          </span>
        </span>
      </button>

      {canMute && (
        <button
          type="button"
          onClick={onToggleMute}
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition ${
            muted ? "bg-white/25 text-white" : "bg-white/10 text-white hover:bg-white/20"
          }`}
          aria-label={muted ? "Unmute" : "Mute"}
          title={muted ? "Unmute" : "Mute"}
        >
          {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>
      )}
      <button
        type="button"
        onClick={onHangup}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-rose-500 text-white transition hover:bg-rose-400"
        aria-label="End call"
        title="End call"
      >
        <PhoneOff className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Connects the calling socket whenever someone is signed in, and renders the
 * global call UI (incoming ring, outgoing ring, and the in-call panel). Mounted
 * once in the root layout so a call can come in on any page.
 */
export function CallProvider() {
  // Keyed on *who* is signed in and whether a token exists at all — never on
  // the token's value. Access tokens rotate every few minutes now, and an
  // effect depending on the string would run its cleanup on every rotation,
  // hanging up a call in progress roughly every twelve minutes. `hasToken`
  // flips false→true once, when the session is restored, and then stays true.
  const userId = useSession((s) => s.user?.id ?? null);
  const hasToken = useSession((s) => Boolean(s.token));
  const connect = useCall((s) => s.connect);
  const disconnect = useCall((s) => s.disconnect);
  const attachRemoteAudio = useCall((s) => s.attachRemoteAudio);

  useEffect(() => {
    if (!userId || !hasToken) return;
    const token = useSession.getState().token;
    if (!token) return;
    connect(token);
    return () => disconnect();
  }, [userId, hasToken, connect, disconnect]);

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

  const minimized = useCall((s) => s.minimized);
  const media = useCall((s) => s.media);
  const cameraOn = useCall((s) => s.cameraOn);
  const screenOn = useCall((s) => s.screenOn);
  const remoteCameraOn = useCall((s) => s.remoteCameraOn);
  const remoteScreenOn = useCall((s) => s.remoteScreenOn);
  const hasRemoteVideoTrack = useCall((s) => s.hasRemoteVideoTrack);

  const accept = useCall((s) => s.accept);
  const reject = useCall((s) => s.reject);
  const hangup = useCall((s) => s.hangup);
  const toggleMute = useCall((s) => s.toggleMute);
  const toggleCamera = useCall((s) => s.toggleCamera);
  const toggleScreenShare = useCall((s) => s.toggleScreenShare);
  const attachLocalVideo = useCall((s) => s.attachLocalVideo);
  const attachRemoteVideo = useCall((s) => s.attachRemoteVideo);
  const setMinimized = useCall((s) => s.setMinimized);

  const inCall = phase === "connected" || phase === "connecting";
  const sendingVideo = cameraOn || screenOn;
  const receivingVideo = remoteCameraOn || remoteScreenOn;
  // The stage appears as soon as either side has a picture to show.
  const showStage = inCall && !minimized && (sendingVideo || receivingVideo);

  const stageRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // The browser can leave fullscreen on its own (Esc, or its own control), so
  // the button follows the document rather than our own bookkeeping.
  useEffect(() => {
    const sync = () => setIsFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  // Never strand the browser in fullscreen when the video goes away — the call
  // ended, or the panel was minimized to the pill.
  useEffect(() => {
    if (!showStage && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, [showStage]);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stageRef.current?.requestFullscreen();
    } catch {
      // Some browsers refuse the request (an embedded frame, a policy) — the
      // call itself is unaffected, so there's nothing to report.
    }
  }

  // A brief toast after a call ends ("Call declined", etc.).
  if (phase === "idle") {
    if (!notice) return null;
    return (
      <div className="fixed inset-x-0 bottom-6 z-60 flex justify-center px-4">
        <p className="rounded-full bg-stone-900/90 px-5 py-2.5 text-sm font-medium text-white shadow-lg backdrop-blur dark:bg-white/15">
          {notice}
        </p>
      </div>
    );
  }

  if (!peer) return null;

  const statusText = statusLabel(phase, durationSec, media);
  // An incoming ring must be answered or declined, so it's never collapsible.
  const canMinimize = phase !== "incoming";

  // The same four buttons appear under the panel and, while fullscreen hides
  // the panel, over the video itself.
  const callControls = inCall ? (
    <>
      <ControlButton onClick={toggleMute} active={muted} label={muted ? "Unmute" : "Mute"}>
        {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
      </ControlButton>
      <ControlButton
        onClick={() => void toggleCamera()}
        active={cameraOn}
        label={cameraOn ? "Turn camera off" : "Turn camera on"}
      >
        {cameraOn ? <Video className="h-6 w-6" /> : <VideoOff className="h-6 w-6" />}
      </ControlButton>
      <ControlButton
        onClick={() => void toggleScreenShare()}
        active={screenOn}
        label={screenOn ? "Stop sharing your screen" : "Share your screen"}
      >
        {screenOn ? <MonitorOff className="h-6 w-6" /> : <MonitorUp className="h-6 w-6" />}
      </ControlButton>
      <ControlButton onClick={hangup} danger label="End call">
        <PhoneOff className="h-6 w-6" />
      </ControlButton>
    </>
  ) : null;

  if (minimized && canMinimize) {
    return (
      <CallPill
        peer={peer}
        statusText={statusText}
        muted={muted}
        canMute={inCall}
        sharing={screenOn || remoteScreenOn}
        video={sendingVideo || receivingVideo}
        onExpand={() => setMinimized(false)}
        onToggleMute={toggleMute}
        onHangup={hangup}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-60 grid place-items-center bg-stone-950/60 p-4 backdrop-blur-sm"
      // Clicking the dimmed area (not the card) collapses the call, the way
      // tapping outside a Messenger call does.
      onClick={(e) => {
        if (canMinimize && e.target === e.currentTarget) setMinimized(true);
      }}
    >
      <div
        className={`w-full rounded-3xl border border-white/40 bg-white/80 p-6 text-center shadow-2xl backdrop-blur-xl sm:p-8 dark:border-white/10 dark:bg-[#0b1220]/90 ${
          showStage ? "max-w-3xl" : "max-w-sm"
        }`}
      >
        {showStage ? (
          <VideoStage
            peer={peer}
            remoteOn={receivingVideo}
            remoteScreen={remoteScreenOn}
            remoteTrackReady={hasRemoteVideoTrack}
            localOn={sendingVideo}
            localScreen={screenOn}
            attachLocal={attachLocalVideo}
            attachRemote={attachRemoteVideo}
            containerRef={stageRef}
            isFullscreen={isFullscreen}
            onToggleFullscreen={() => void toggleFullscreen()}
          >
            {callControls}
          </VideoStage>
        ) : (
          <span
            className={`mx-auto grid h-24 w-24 place-items-center rounded-full bg-amber-400 text-4xl font-extrabold text-stone-950 ${
              phase === "incoming" || phase === "outgoing" ? "animate-pulse" : ""
            }`}
          >
            {peer.name[0]?.toUpperCase()}
          </span>
        )}

        <h2 className={`text-2xl font-extrabold tracking-tight ${showStage ? "mt-4" : "mt-5"}`}>
          {peer.name}
        </h2>
        <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">{roleLabel(peer.role)}</p>
        <p className="mt-2 text-sm font-semibold tabular-nums text-amber-600 dark:text-amber-400">
          {statusText}
        </p>

        {/* The meters are the quickest way to tell who isn't being heard, so
            they stay on voice calls; a video call has the picture instead. */}
        {inCall && !showStage && (
          <div className="mt-6 space-y-2 text-left">
            <LevelMeter label="You" level={localLevel} muted={muted} />
            <LevelMeter label={peer.name} level={remoteLevel} />
          </div>
        )}

        {notice && (
          <p className="mt-4 rounded-xl bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
            {notice}
          </p>
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
            (callControls ?? (
              <ControlButton onClick={hangup} danger label="End call">
                <PhoneOff className="h-6 w-6" />
              </ControlButton>
            ))
          )}
        </div>

        {/* The call keeps running once collapsed — only the panel goes away. */}
        {canMinimize && (
          <button
            type="button"
            onClick={() => setMinimized(true)}
            className="mx-auto mt-6 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-stone-500 transition hover:bg-black/5 hover:text-stone-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100"
          >
            <Minimize2 className="h-3.5 w-3.5" />
            Minimize, keep using Buildora
          </button>
        )}
      </div>
    </div>
  );
}
