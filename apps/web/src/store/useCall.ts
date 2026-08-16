"use client";

import { io, type Socket } from "socket.io-client";
import { create } from "zustand";
import {
  CALL_EVENTS,
  CallMedia,
  type CallMediaStatePayload,
  type CallPeer,
  type IncomingCallPayload,
} from "@buildora/shared";
import { API_BASE_URL } from "@/lib/api";
import { getIceConfig } from "@/lib/apiCalls";
import { startRing, stopRing } from "@/lib/ringtone";
import { useSession } from "@/store/useSession";

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
  /** How the call was placed. Either side can add video later regardless. */
  media: CallMedia;
  /** Our camera is on and being sent. */
  cameraOn: boolean;
  /** We're sharing our screen (which takes over the video we send). */
  screenOn: boolean;
  /** Their camera is on, as reported by their client. */
  remoteCameraOn: boolean;
  /** They're sharing their screen. */
  remoteScreenOn: boolean;
  /**
   * We have an actual incoming video track. Separate from the two flags above:
   * those say what they *intend* to send, this says whether the connection has
   * caught up. Between the two the UI can say "connecting" instead of showing
   * a black rectangle.
   */
  hasRemoteVideoTrack: boolean;
  muted: boolean;
  /** Seconds since the audio connected (drives the on-screen timer). */
  durationSec: number;
  /** A short message shown after a call ends (e.g. "Call declined"). */
  notice: string | null;
  /** Live 0–1 loudness of our own mic — proves the mic is capturing. */
  localLevel: number;
  /** Live 0–1 loudness of the other side's incoming audio — proves we receive it. */
  remoteLevel: number;
  /**
   * True when the call has been collapsed to the floating pill, so the rest of
   * the app is usable mid-call. An incoming ring ignores this — it always takes
   * over the screen until it's answered or declined.
   */
  minimized: boolean;

  connect: (token: string) => void;
  disconnect: () => void;
  /** Registers the hidden <audio> element the remote voice plays through. */
  attachRemoteAudio: (el: HTMLAudioElement | null) => void;
  /** Registers the <video> showing our own camera/screen (mounted only when visible). */
  attachLocalVideo: (el: HTMLVideoElement | null) => void;
  /** Registers the <video> showing the other side's camera/screen. */
  attachRemoteVideo: (el: HTMLVideoElement | null) => void;
  start: (peer: CallPeer, media?: CallMedia) => Promise<void>;
  accept: () => Promise<void>;
  reject: () => void;
  hangup: () => void;
  toggleMute: () => void;
  /** Turn our camera on or off mid-call. Stops any screen share. */
  toggleCamera: () => Promise<void>;
  /** Start or stop sharing our screen. Takes over the video we send. */
  toggleScreenShare: () => Promise<void>;
  /** Collapse the call to the pill (true) or bring the full panel back (false). */
  setMinimized: (minimized: boolean) => void;
}

// --- Live objects (not React state) ---
let socket: Socket | null = null;
let socketUserId: string | null = null;
let pc: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;
let remoteAudio: HTMLAudioElement | null = null;
let iceServers: RTCIceServer[] | null = null;
let isCaller = false;

// --- Video: camera and screen share ---
// One video sender is created with the peer connection and kept for the whole
// call. Turning the camera on, switching to the screen, and turning it off are
// all `replaceTrack()` on this sender — the m-line was already negotiated, so
// none of it needs a new offer/answer round trip.
let videoSender: RTCRtpSender | null = null;
let cameraStream: MediaStream | null = null;
let screenStream: MediaStream | null = null;
/** The remote video track, kept apart from the audio so each gets its own element. */
let remoteVideoStream: MediaStream | null = null;
let localVideoEl: HTMLVideoElement | null = null;
let remoteVideoEl: HTMLVideoElement | null = null;

// --- Renegotiation ("perfect negotiation") ---
// Turning a camera or screen share on mid-call changes what this connection
// carries, so it has to be re-described. Crucially, the side that gained the
// track must be the one that *offers*: an offer is the only place you can say
// "I am going to send this", while an answer can only accept what the offer
// already allowed. That's why the callee has to be able to offer too.
//
// Two offers crossing in flight is the classic way a call wedges, so one side
// is designated polite: on a collision it rolls its own offer back and takes
// the other side's. The caller is impolite (ignores a colliding offer), the
// callee is polite.
let makingOffer = false;
let ignoreOffer = false;
/** Offers are only sent once the first offer/answer has finished. */
let negotiationOpen = false;
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
          () =>
            set({ localLevel: readLevel(localAnalyser), remoteLevel: readLevel(remoteAnalyser) }),
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
    stopCamera();
    stopScreen();
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.close();
    }
    if (remoteAudio) remoteAudio.srcObject = null;
    if (localVideoEl) localVideoEl.srcObject = null;
    if (remoteVideoEl) remoteVideoEl.srcObject = null;
    if (durationTimer) clearInterval(durationTimer);
    pc = null;
    localStream = null;
    videoSender = null;
    remoteVideoStream = null;
    isCaller = false;
    makingOffer = false;
    ignoreOffer = false;
    negotiationOpen = false;
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
      minimized: false, // the next call should open expanded
      media: CallMedia.AUDIO,
      cameraOn: false,
      screenOn: false,
      remoteCameraOn: false,
      remoteScreenOn: false,
      hasRemoteVideoTrack: false,
    });
    if (notice) setTimeout(() => get().notice === notice && set({ notice: null }), 4000);
  }

  /** The video we're currently sending: the screen wins over the camera. */
  function localVideoStream(): MediaStream | null {
    return screenStream ?? cameraStream;
  }

  /** Points the two <video> elements at whatever their stream is right now. */
  function syncVideoElements() {
    if (localVideoEl) localVideoEl.srcObject = localVideoStream();
    if (remoteVideoEl) remoteVideoEl.srcObject = remoteVideoStream;
  }

  /** Tells the other side what we're sending, so their UI matches reality. */
  function sendMediaState() {
    const { callId, cameraOn, screenOn } = get();
    if (!callId) return;
    socket?.emit(CALL_EVENTS.mediaState, { callId, cameraOn, screenOn });
  }

  /**
   * Starts, swaps, or stops the video we send.
   *
   * Adding or removing a track changes what this connection carries, so the
   * browser raises `negotiationneeded` and we offer — and because the offer is
   * ours, it's ours that says we're sending video. Swapping camera ↔ screen
   * reuses the existing sender, which needs no renegotiation at all: same
   * channel, different picture.
   */
  async function setLocalVideoTrack(track: MediaStreamTrack | null) {
    if (pc) {
      if (track && videoSender) {
        await videoSender.replaceTrack(track).catch(() => {});
      } else if (track) {
        videoSender = pc.addTrack(track, new MediaStream([track]));
      } else if (videoSender) {
        pc.removeTrack(videoSender);
        videoSender = null;
      }
    }
    syncVideoElements();
    sendMediaState();
  }

  /** Stops the camera and releases the light. */
  function stopCamera() {
    cameraStream?.getTracks().forEach((t) => t.stop());
    cameraStream = null;
  }

  /** Stops the screen share (also called when the browser's own "stop" is used). */
  function stopScreen() {
    screenStream?.getTracks().forEach((t) => t.stop());
    screenStream = null;
  }

  /** Grabs the camera. Throws if the user denies it or there's no camera. */
  async function getCamera(): Promise<MediaStream> {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false, // the mic is captured separately so mute stays independent
    });
    return cameraStream;
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
    // Read the token live: the one this socket connected with may well have
    // been rotated out by the time a call is placed.
    const token = useSession.getState().token;
    if (!iceServers && token) {
      iceServers = (await getIceConfig(token)) as RTCIceServer[];
    }
    const connection = new RTCPeerConnection({ iceServers: iceServers ?? [] });

    // Send our network candidates to the other side as they're discovered.
    connection.onicecandidate = (e) => {
      if (e.candidate) socket?.emit(CALL_EVENTS.ice, { callId, candidate: e.candidate.toJSON() });
    };

    // Their media arrives here. Audio and video are kept in separate streams:
    // the voice plays through the hidden <audio> element CallProvider mounts (a
    // real DOM element is far more reliable than a detached Audio() under
    // browser autoplay rules), and the picture goes to the <video> in the call
    // panel — which only exists while the panel is open.
    connection.ontrack = (e) => {
      if (e.track.kind === "video") {
        remoteVideoStream = new MediaStream([e.track]);
        set({ hasRemoteVideoTrack: true });
        // A renegotiation can hand us the video track long after the call
        // started, so point the element at it whenever it turns up.
        syncVideoElements();
        return;
      }
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
          // Tell them what we're sending now that there's a channel to say it on.
          sendMediaState();
          syncVideoElements();
        }
      } else if (
        connection.connectionState === "failed" ||
        connection.connectionState === "disconnected"
      ) {
        socket?.emit(CALL_EVENTS.hangup, { callId });
        teardown("Call disconnected");
      }
    };

    // The browser tells us whenever what we send has changed (a track added or
    // removed) and the connection needs re-describing. This is the only place
    // an offer is created after the call is up, and it always comes from the
    // side whose tracks changed — which is what makes that side able to send.
    connection.onnegotiationneeded = async () => {
      if (!negotiationOpen || connection.signalingState !== "stable") return;
      try {
        makingOffer = true;
        await connection.setLocalDescription(); // implicit createOffer
        socket?.emit(CALL_EVENTS.offer, { callId, sdp: connection.localDescription });
      } catch {
        // The call carries on as it was; the next toggle tries again.
      } finally {
        makingOffer = false;
      }
    };

    // Feed our mic into the connection.
    localStream?.getTracks().forEach((track) => connection.addTrack(track, localStream!));

    // A video call has its camera ready before this point, so the very first
    // offer/answer already carries video. A voice call starts with no video
    // track at all — switching one on later adds it, and the renegotiation that
    // follows is what tells the other side to expect it.
    const cameraTrack = cameraStream?.getVideoTracks()[0];
    if (cameraTrack) videoSender = connection.addTrack(cameraTrack, cameraStream!);

    // Keep the audio two-way so neither the offer nor the answer can collapse to
    // send-only/receive-only (the cause of one-way audio).
    connection.getTransceivers().forEach((t) => {
      if (t.sender.track?.kind === "audio") t.direction = "sendrecv";
    });
    pc = connection;
    return connection;
  }

  /**
   * Applies an offer and answers it — the first one that sets the call up, and
   * every later one carrying a camera or screen share.
   *
   * Both sides can offer now, so two offers can cross. The polite side (the
   * callee) drops its own and takes theirs — `setRemoteDescription` rolls ours
   * back for us. The impolite side (the caller) keeps its own and ignores
   * theirs, and their polite side will come back around to ours.
   */
  async function answerOffer(offer: RTCSessionDescriptionInit, callId: string) {
    if (!pc) {
      pendingOffer = offer; // mic/peer not ready yet — apply once it is
      return;
    }
    const polite = !isCaller;
    const collision = makingOffer || pc.signalingState !== "stable";
    ignoreOffer = !polite && collision;
    if (ignoreOffer) return;

    await pc.setRemoteDescription(offer);
    // Keep the audio two-way whatever the offer said (one-way-audio guard).
    pc.getTransceivers().forEach((t) => {
      if (t.sender.track?.kind === "audio" || t.receiver.track?.kind === "audio") {
        t.direction = "sendrecv";
      }
    });
    for (const c of pendingCandidates) await pc.addIceCandidate(c).catch(() => {});
    pendingCandidates = [];
    await pc.setLocalDescription(); // implicit createAnswer
    socket?.emit(CALL_EVENTS.answer, { callId, sdp: pc.localDescription });
    negotiationOpen = true; // from here on, our own changes may offer
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
    minimized: false,
    media: CallMedia.AUDIO,
    cameraOn: false,
    screenOn: false,
    remoteCameraOn: false,
    remoteScreenOn: false,
    hasRemoteVideoTrack: false,

    connect(token) {
      // Compared by user, not by token: tokens rotate every few minutes and
      // rebuilding the signaling socket on each rotation would drop live calls.
      const userId = useSession.getState().user?.id ?? null;
      if (socket && socketUserId === userId) return; // already connected as this user
      get().disconnect();
      socketUserId = userId;
      iceServers = null;
      // Callback form so a reconnect after a network blip presents the current
      // token rather than the expired one this socket first opened with.
      socket = io(API_BASE_URL, {
        auth: (cb) => cb({ token: useSession.getState().token ?? token }),
      });

      // Prefetch the ICE servers now so building the peer connection during a
      // call never has to await the network mid-negotiation — that await is
      // what lets the offer race ahead of the answerer's tracks (one-way audio).
      getIceConfig(token)
        .then((servers) => {
          iceServers = servers as RTCIceServer[];
        })
        .catch(() => {});

      // Someone is calling us. Auto-decline if we're already on a call.
      socket.on(CALL_EVENTS.incoming, ({ callId, from, media }: IncomingCallPayload) => {
        if (get().phase !== "idle") {
          socket?.emit(CALL_EVENTS.reject, { callId });
          return;
        }
        isCaller = false;
        set({
          phase: "incoming",
          peer: from,
          callId,
          durationSec: 0,
          notice: null,
          minimized: false,
          media: media ?? CallMedia.AUDIO,
          cameraOn: false,
          screenOn: false,
          remoteCameraOn: false,
          remoteScreenOn: false,
          hasRemoteVideoTrack: false,
        });
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

      // An offer from the other side: the first one that sets the call up, and
      // any later one carrying a camera or screen share. Either side can send
      // these now, so answerOffer sorts out two that cross.
      socket.on(
        CALL_EVENTS.peerOffer,
        async ({ callId, sdp }: { callId: string; sdp: unknown }) => {
          if (get().callId !== callId) return;
          await answerOffer(sdp as RTCSessionDescriptionInit, callId);
        }
      );

      // An answer to an offer we sent.
      socket.on(
        CALL_EVENTS.peerAnswer,
        async ({ callId, sdp }: { callId: string; sdp: unknown }) => {
          if (!pc || get().callId !== callId) return;
          await pc.setRemoteDescription(sdp as RTCSessionDescriptionInit);
          for (const c of pendingCandidates) await pc.addIceCandidate(c).catch(() => {});
          pendingCandidates = [];
          negotiationOpen = true; // from here on, our own changes may offer
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

      // They turned their camera or screen share on or off.
      socket.on(
        CALL_EVENTS.peerMediaState,
        ({ callId, cameraOn, screenOn }: CallMediaStatePayload) => {
          if (get().callId !== callId) return;
          set({ remoteCameraOn: cameraOn, remoteScreenOn: screenOn });
          syncVideoElements();
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
      socketUserId = null;
    },

    attachRemoteAudio(el) {
      remoteAudio = el;
    },

    attachLocalVideo(el) {
      localVideoEl = el;
      if (el) el.srcObject = localVideoStream();
    },

    attachRemoteVideo(el) {
      remoteVideoEl = el;
      if (el) el.srcObject = remoteVideoStream;
    },

    async start(peer, media = CallMedia.AUDIO) {
      if (!socket || get().phase !== "idle") return;
      try {
        await getMic();
      } catch {
        teardown("Microphone access is needed to call");
        return;
      }
      // On a video call, ask for the camera up front so both prompts happen
      // before it rings. A refused camera still places a working voice call.
      let cameraOn = false;
      if (media === CallMedia.VIDEO) {
        cameraOn = await getCamera().then(
          () => true,
          () => false
        );
      }
      isCaller = true;
      set({
        phase: "outgoing",
        peer,
        callId: null,
        // A refused camera needs no message — the panel simply shows the camera
        // button as off, and it can be turned on later if they change their mind.
        notice: null,
        minimized: false,
        media,
        cameraOn,
        screenOn: false,
        remoteCameraOn: false,
        remoteScreenOn: false,
        hasRemoteVideoTrack: false,
      });
      syncVideoElements();
      startRing("outgoing");
      socket.emit(
        CALL_EVENTS.start,
        { toUserId: peer.id, media },
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
      const { callId, media } = get();
      if (!socket || !callId || get().phase !== "incoming") return;
      stopRing(); // we answered — stop the incoming ring
      try {
        await getMic();
      } catch {
        socket.emit(CALL_EVENTS.reject, { callId });
        teardown("Microphone access is needed to answer");
        return;
      }
      // Answer a video call with our camera on; if it's refused we still join,
      // just without sending a picture (we can still see theirs).
      let cameraOn = false;
      if (media === CallMedia.VIDEO) {
        cameraOn = await getCamera().then(
          () => true,
          () => false
        );
      }
      set({ phase: "connecting", cameraOn });
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

    async toggleCamera() {
      const { cameraOn, screenOn } = get();
      if (cameraOn) {
        stopCamera();
        set({ cameraOn: false });
        // Nothing left to send unless a screen share is still running.
        if (!screenOn) await setLocalVideoTrack(null);
        else {
          syncVideoElements();
          sendMediaState();
        }
        return;
      }
      try {
        await getCamera();
      } catch {
        set({ notice: "Camera access was blocked" });
        setTimeout(
          () => get().notice === "Camera access was blocked" && set({ notice: null }),
          4000
        );
        return;
      }
      set({ cameraOn: true });
      // A running screen share keeps the wire; the camera takes over when it ends.
      if (screenOn) {
        syncVideoElements();
        sendMediaState();
      } else {
        await setLocalVideoTrack(cameraStream!.getVideoTracks()[0] ?? null);
      }
    },

    async toggleScreenShare() {
      const { screenOn, cameraOn } = get();
      if (screenOn) {
        stopScreen();
        set({ screenOn: false });
        // Fall back to the camera if it's still on, otherwise send nothing.
        await setLocalVideoTrack(cameraOn ? (cameraStream?.getVideoTracks()[0] ?? null) : null);
        return;
      }
      try {
        // The browser draws its own picker here — we never choose the window.
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      } catch {
        return; // cancelled the picker, or the browser blocked it — no harm
      }
      // "Stop sharing" in the browser's own bar ends the track behind our back,
      // so mirror that back into our state.
      const track = screenStream.getVideoTracks()[0];
      if (track) {
        track.onended = () => {
          stopScreen();
          set({ screenOn: false });
          void setLocalVideoTrack(
            get().cameraOn ? (cameraStream?.getVideoTracks()[0] ?? null) : null
          );
        };
      }
      set({ screenOn: true });
      await setLocalVideoTrack(track ?? null);
    },

    setMinimized(minimized) {
      set({ minimized });
    },
  };
});
