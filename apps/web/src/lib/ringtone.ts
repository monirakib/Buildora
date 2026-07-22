"use client";

/**
 * Call tones, synthesized with the Web Audio API so there are no audio files to
 * ship. Used for the outgoing ringback (what the caller hears while waiting) and
 * the incoming ring (what the callee hears). Best-effort: if the browser blocks
 * audio until the user interacts with the page, the tone just stays silent while
 * the on-screen call UI still shows.
 */

let audioCtx: AudioContext | null = null;
let ringTimer: ReturnType<typeof setInterval> | null = null;

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  return audioCtx;
}

/** One short beep at `freq`, faded in and out so it doesn't click. */
function beep(ac: AudioContext, freq: number, at: number, duration: number) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.18, at + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(at);
  osc.stop(at + duration + 0.05);
}

/** Starts the repeating ring/ringback until stopRing() is called. */
export function startRing(kind: "incoming" | "outgoing") {
  stopRing();
  const ac = ctx();
  if (!ac) return;
  void ac.resume();

  const play = () => {
    const t = ac.currentTime;
    if (kind === "incoming") {
      // Classic "ring-ring" double beep.
      beep(ac, 480, t, 0.4);
      beep(ac, 440, t + 0.5, 0.4);
    } else {
      // Single ringback tone.
      beep(ac, 440, t, 0.8);
    }
  };

  play();
  ringTimer = setInterval(play, kind === "incoming" ? 2200 : 3000);
}

/** Stops any tone currently playing. */
export function stopRing() {
  if (ringTimer) {
    clearInterval(ringTimer);
    ringTimer = null;
  }
}
