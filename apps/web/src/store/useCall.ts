"use client";

import { io, type Socket } from "socket.io-client";
import { create } from "zustand";
import { CALL_EVENTS, type CallPeer, type IncomingCallPayload } from "@buildora/shared";
import { API_BASE_URL } from "@/lib/api";
import { getIceConfig } from "@/lib/apiCalls";
import { startRing, stopRing } from "@/lib/ringtone";

/**
 * 1:1 voice calling over WebRTC.
 *
 * The audio streams peer-to-peer between the two browsers — it never passes
 * through our server. The server (Socket.IO) only carries *signaling*: the ring,
 * the accept/reject, and the SDP/ICE handshake that lets the two browsers find
 * each other.
 *
 * The React-visible state (phase, who you're talking to, mute, timer) lives in
 * the Zustand store. The live WebRTC objects (peer connection, mic stream, the
 * socket) are plain module variables — they're not render state, so keeping them
 * out of the store avoids needless re-renders.
 */

/** Where a call is in its lifecycle, from this browser's point of view. */
export type CallPhase =
  | "idle" // no call
  | "outgoing" // we dialed, waiting for them to pick up
  | "incoming" // they're calling us, we haven't answered
  | "connecting" // answered on both sides, media still hooking up
  | "connected"; // audio flowing

interface CallState {
  phase: CallPhase;
  /** The other person on the call. */
  peer: CallPeer | null;
  callId: string | null;
  muted: boolean;
  /** Seconds since the audio connected (drives the on-screen timer). */
  durationSec: number;
  /** A short message shown after a call ends (e.g. "Call declined"). */
  notice: string | null;
  /** Live 0–1 loudness of our own mic — proves the mic is capturing. */
  localLevel: number;
  /** Live 0–1 loudness of the other side's incoming audio — proves we receive it. */
  remoteLevel: number;

  connect: (token: string) => void;
  disconnect: () => void;
  /** Registers the hidden <audio> element the remote voice plays through. */
  attachRemoteAudio: (el: HTMLAudioElement | null) => void;
  start: (peer: CallPeer) => Promise<void>;
  accept: () => Promise<void>;
  reject: () => void;
  hangup: () => void;
  toggleMute: () => void;
}

// --- Live objects (not React state) ---
let socket: Socket | null = null;
let socketToken: string | null = null;
let pc: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;
let remoteAudio: HTMLAudioElement | null = null;
let iceServers: RTCIceServer[] | null = null;
let isCaller = false;
/** An SDP offer that arrived before our peer connection was ready. */
let pendingOffer: RTCSessionDescriptionInit | null = null;
/** ICE candidates that arrived before we'd set the remote description. */
let pendingCandidates: RTCIceCandidateInit[] = [];
let durationTimer: ReturnType<typeof setInterval> | null = null;

// --- Audio level metering (diagnostics): AnalyserNodes tap the local mic and
// the remote stream so the call UI can show whether each side has sound. ---
let meterCtx: AudioContext | null = null;
let localAnalyser: AnalyserNode | null = null;
let remoteAnalyser: AnalyserNode | null = null;
let meterTimer: ReturnType<typeof setInterval> | null = null;

export const useCall = create<CallState>((set, get) => {
  /** RMS loudness (0–1) of an analyser's current audio, scaled to be visible. */
  function readLevel(analyser: AnalyserNode | null): number {
    if (!analyser) return 0;
    const buf = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) {
      const d = (v - 128) / 128;
      sum += d * d;
    }
    return Math.min(1, Math.sqrt(sum / buf.length) * 4);
  }

  /** Taps a stream with an AnalyserNode so we can show its live level. */
  function meterStream(stream: MediaStream, kind: "local" | "remote") {
    try {
      if (!meterCtx) meterCtx = new AudioContext();
      void meterCtx.resume();
      const source = meterCtx.createMediaStreamSource(stream);
      const analyser = meterCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser); // analyser only — the <audio> element does playback
      if (kind === "local") localAnalyser = analyser;
      else remoteAnalyser = analyser;
      if (!meterTimer) {
        meterTimer = setInterval(
          () => set({ localLevel: readLevel(localAnalyser), remoteLevel: readLevel(remoteAnalyser) }),
          100
        );
      }
    } catch {
      // Metering is diagnostics only — never let it break a call.
    }
  }

  function stopMeter() {
    if (meterTimer) clearInterval(meterTimer);
    meterTimer = null;
    localAnalyser = null;
    remoteAnalyser = null;
    void meterCtx?.close().catch(() => {});
    meterCtx = null;
  }

  /** Resets everything to idle, optionally leaving a notice behind. */
  function teardown(notice: string | null = null) {
    stopRing();
    stopMeter();
    localStream?.getTracks().forEach((t) => t.stop());
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.close();
    }
    if (remoteAudio) remoteAudio.srcObject = null;
    if (durationTimer) clearInterval(durationTimer);
    pc = null;
    localStream = null;
    isCaller = false;
    pendingOffer = null;
    pendingCandidates = [];
    durationTimer = null;
    set({
      phase: "idle",
      peer: null,
      callId: null,
      muted: false,
      durationSec: 0,
      notice,
      localLevel: 0,
      remoteLevel: 0,
    });
    if (notice) setTimeout(() => get().notice === notice && set({ notice: null }), 4000);
  }

  /** Grabs the mic (prompts the user the first time). Throws if denied. */
  async function getMic(): Promise<MediaStream> {
    localStream = await navigator.mediaDevices.getUserMedia({
      // Explicit voice processing rather than relying on browser defaults.
      // Note: when both sides run on one machine through the same speakers,
      // echo cancellation cancels almost everything — test with headphones or
      // two separate devices to actually hear each other.
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    meterStream(localStream, "local"); // so the UI can show our mic is live
    return localStream;
  }

  /** Fetches (and caches) the STUN/TURN servers, then builds the peer connection. */
  async function buildPeer(callId: string): Promise<RTCPeerConnection> {
    if (!iceServers && socketToken) {
      iceServers = (await getIceConfig(socketToken)) as RTCIceServer[];
    }
    const connection = new RTCPeerConnection({ iceServers: iceServers ?? [] });

    // Send our network candidates to the other side as they're discovered.
    connection.onicecandidate = (e) => {
      if (e.candidate) socket?.emit(CALL_EVENTS.ice, { callId, candidate: e.candidate.toJSON() });
    };

    // Their audio arrives here — play it through the hidden <audio> element
    // that CallProvider mounts in the page (a real DOM element is far more
    // reliable than a detached Audio() under browser autoplay rules).
    connection.ontrack = (e) => {
      const [stream] = e.streams;
      if (!stream) return;
      if (!remoteAudio) remoteAudio = new Audio();
      remoteAudio.srcObject = stream;
      remoteAudio.muted = false;
      remoteAudio.volume = 1;
      void remoteAudio.play().catch(() => {});
      meterStream(stream, "remote"); // so the UI can show their audio is arriving
    };

    // Once ICE actually connects, the call is live — start the timer.
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === "connected") {
        // Nudge playback again in case the first autoplay attempt was blocked.
        if (remoteAudio) void remoteAudio.play().catch(() => {});
        if (get().phase !== "connected") {
          set({ phase: "connected", durationSec: 0 });
          durationTimer = setInterval(() => set((s) => ({ durationSec: s.durationSec + 1 })), 1000);
        }
      } else if (
        connection.connectionState === "failed" ||
        connection.connectionState === "disconnected"
      ) {
        socket?.emit(CALL_EVENTS.hangup, { callId });
        teardown("Call disconnected");
      }
    };

    // Feed our mic into the connection.
    localStream?.getTracks().forEach((track) => connection.addTrack(track, localStream!));
    // Force the audio transceiver to two-way so neither the offer nor the answer
    // can collapse to send-only/receive-only (the cause of one-way audio).
    connection.getTransceivers().forEach((t) => {
      if (t.sender.track?.kind === "audio") t.direction = "sendrecv";
    });
    pc = connection;
    return connection;
  }

  /** Applies an offer we received (callee side), then answers it. */
  async function answerOffer(offer: RTCSessionDescriptionInit, callId: string) {
    if (!pc) {
      pendingOffer = offer; // mic/peer not ready yet — apply once it is
      return;
    }
    await pc.setRemoteDescription(offer);
    // Keep the audio two-way after associating with the remote offer, so our
    // answer is sendrecv rather than collapsing to receive-only.
    pc.getTransceivers().forEach((t) => {
      if (t.sender.track?.kind === "audio" || t.receiver.track?.kind === "audio") {
        t.direction = "sendrecv";
      }
    });
    for (const c of pendingCandidates) await pc.addIceCandidate(c).catch(() => {});
    pendingCandidates = [];
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket?.emit(CALL_EVENTS.answer, { callId, sdp: answer });
  }

  return {
    phase: "idle",
    peer: null,
    callId: null,
    muted: false,
    durationSec: 0,
    notice: null,
    localLevel: 0,
    remoteLevel: 0,

    connect(token) {
      if (socket && socketToken === token) return; // already connected as this user
      get().disconnect();
      socketToken = token;
      iceServers = null;
      socket = io(API_BASE_URL, { auth: { token } });

      // Prefetch the ICE servers now so building the peer connection during a
      // call never has to await the network mid-negotiation — that await is
      // what lets the offer race ahead of the answerer's tracks (one-way audio).
      getIceConfig(token)
        .then((servers) => {
          iceServers = servers as RTCIceServer[];
        })
        .catch(() => {});

      // Someone is calling us. Auto-decline if we're already on a call.
      socket.on(CALL_EVENTS.incoming, ({ callId, from }: IncomingCallPayload) => {
        if (get().phase !== "idle") {
          socket?.emit(CALL_EVENTS.reject, { callId });
          return;
        }
        isCaller = false;
        set({ phase: "incoming", peer: from, callId, durationSec: 0, notice: null });
        startRing("incoming");
      });

      // They picked up — as the caller, we now create and send the SDP offer.
      socket.on(CALL_EVENTS.accepted, async ({ callId }: { callId: string }) => {
        if (!isCaller || get().callId !== callId) return;
        stopRing(); // they picked up — stop the ringback
        set({ phase: "connecting" });
        const connection = await buildPeer(callId);
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        socket?.emit(CALL_EVENTS.offer, { callId, sdp: offer });
      });

      // The callee receives the caller's offer and answers it.
      socket.on(CALL_EVENTS.peerOffer, async ({ callId, sdp }: { callId: string; sdp: unknown }) => {
        if (get().callId !== callId) return;
        await answerOffer(sdp as RTCSessionDescriptionInit, callId);
      });

      // Caller receives the callee's answer.
      socket.on(
        CALL_EVENTS.peerAnswer,
        async ({ callId, sdp }: { callId: string; sdp: unknown }) => {
          if (!pc || get().callId !== callId) return;
          await pc.setRemoteDescription(sdp as RTCSessionDescriptionInit);
          for (const c of pendingCandidates) await pc.addIceCandidate(c).catch(() => {});
          pendingCandidates = [];
        }
      );

      // A trickled ICE candidate from the other side.
      socket.on(
        CALL_EVENTS.peerIce,
        async ({ callId, candidate }: { callId: string; candidate: unknown }) => {
          if (get().callId !== callId) return;
          const cand = candidate as RTCIceCandidateInit;
          if (pc?.remoteDescription) await pc.addIceCandidate(cand).catch(() => {});
          else pendingCandidates.push(cand); // buffer until remote description is set
        }
      );

      socket.on(CALL_EVENTS.rejected, () => teardown("Call declined"));
      socket.on(CALL_EVENTS.unavailable, () => teardown("User is unavailable"));
      socket.on(CALL_EVENTS.cancelled, () => teardown("Call cancelled"));
      socket.on(CALL_EVENTS.ended, () => teardown(null));
    },

    disconnect() {
      if (get().phase !== "idle") teardown(null);
      socket?.disconnect();
      socket = null;
      socketToken = null;
    },

    attachRemoteAudio(el) {
      remoteAudio = el;
    },

    async start(peer) {
      if (!socket || get().phase !== "idle") return;
      try {
        await getMic();
      } catch {
        teardown("Microphone access is needed to call");
        return;
      }
      isCaller = true;
      set({ phase: "outgoing", peer, callId: null, notice: null });
      startRing("outgoing");
      socket.emit(
        CALL_EVENTS.start,
        { toUserId: peer.id },
        (res: { callId?: string; error?: string }) => {
          if (res.error || !res.callId) {
            teardown(res.error ?? "Couldn't place the call");
            return;
          }
          set({ callId: res.callId });
        }
      );
    },

    async accept() {
      const { callId } = get();
      if (!socket || !callId || get().phase !== "incoming") return;
      stopRing(); // we answered — stop the incoming ring
      try {
        await getMic();
      } catch {
        socket.emit(CALL_EVENTS.reject, { callId });
        teardown("Microphone access is needed to answer");
        return;
      }
      set({ phase: "connecting" });
      // Build our peer connection — with our mic track attached — BEFORE telling
      // the caller to send its offer. This guarantees our audio sender exists so
      // the answer we generate is send+receive, not receive-only (which is what
      // caused callee→caller audio to go missing).
      await buildPeer(callId);
      socket.emit(CALL_EVENTS.accept, { callId });
      // If the caller's offer still somehow beat us here, handle it now.
      if (pendingOffer) {
        const offer = pendingOffer;
        pendingOffer = null;
        await answerOffer(offer, callId);
      }
    },

    reject() {
      const { callId } = get();
      if (callId) socket?.emit(CALL_EVENTS.reject, { callId });
      teardown(null);
    },

    hangup() {
      const { callId } = get();
      if (callId) socket?.emit(CALL_EVENTS.hangup, { callId });
      teardown(null);
    },

    toggleMute() {
      if (!localStream) return;
      const next = !get().muted;
      localStream.getAudioTracks().forEach((t) => (t.enabled = !next));
      set({ muted: next });
    },
  };
});
