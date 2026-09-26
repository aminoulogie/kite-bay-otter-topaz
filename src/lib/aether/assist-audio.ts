import type { Guidance } from "./assist.ts";
import { tapLight, tapMedium, tapSuccess } from "../haptics.ts";

/**
 * Plays a Guidance as sound: parking-sensor beeps, a hold tone, event cues,
 * and a spoken coach.
 *
 * ## Silent switch
 *
 * The audio session is declared "ambient", which on iOS is exactly the
 * category the ring/silent switch mutes — so sound follows the switch, as
 * agreed. Speech goes through the same session.
 *
 * ## Why an explicit enable()
 *
 * iOS starts every AudioContext suspended until a tap resumes it. enable() is
 * called from the Camera button's tap, the one gesture the scan screen always
 * gets; anything created later in a timer would stay silent forever.
 */

type Cue = "target" | "capture" | "done";

const HOLD_GAIN = 0.05;
const BEEP_GAIN = 0.14;
const BEEP_MS = 70;

/** Minimum gap between two spoken lines, and between repeats of the same one. */
const SPEAK_GAP_MS = 2500;
const REPEAT_MS = 6000;

export class AssistAudio {
  sound = true;
  voice = true;

  private ctx: AudioContext | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private hold: { osc: OscillatorNode; gain: GainNode } | null = null;
  private current: Guidance | null = null;
  private lastSpoken = "";
  private lastSpokenAt = 0;

  /** Call from a user gesture. Safe to call repeatedly. */
  enable(): void {
    try {
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (session) session.type = "ambient";
    } catch {
      /* older WebKit: the default is already ambient */
    }
    try {
      if (!this.ctx) {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new Ctx();
      }
      void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
    // iOS also gates speech on a gesture: an empty utterance here unlocks it.
    try {
      if (this.voice && "speechSynthesis" in window) {
        const u = new SpeechSynthesisUtterance("");
        u.volume = 0;
        window.speechSynthesis.speak(u);
      }
    } catch {
      /* no speech on this device */
    }
  }

  /** Follow a new frame's guidance. Cheap to call eight times a second. */
  update(g: Guidance | null): void {
    const wasHolding = this.current?.beepMs === 0;
    this.current = g;
    if (!g || !this.sound || !this.ctx) {
      this.stopHold();
      this.clearTimer();
    } else if (g.beepMs === 0) {
      this.clearTimer();
      if (!wasHolding) {
        this.cue("target");
        this.startHold(g);
      }
    } else {
      this.stopHold();
      if (!this.timer) this.scheduleBeep();
    }
    if (g) this.say(g.phrase);
  }

  /** One-off sounds for events, with a matching haptic. */
  cue(kind: Cue): void {
    if (kind === "target") tapLight();
    else if (kind === "capture") tapMedium();
    else tapSuccess();
    if (!this.sound || !this.ctx) return;
    const notes: Record<Cue, [number, number][]> = {
      target: [[784, 0], [1046, 0.09]],
      capture: [[1568, 0], [1175, 0.05]],
      done: [[659, 0], [880, 0.12], [1318, 0.24]],
    };
    for (const [hz, at] of notes[kind]) this.tone(hz, 0, at, kind === "done" ? 0.22 : 0.09, 0.16);
  }

  /** Speak a line now, bypassing the throttle — for events like "Captured." */
  announce(text: string): void {
    this.lastSpoken = "";
    this.lastSpokenAt = 0;
    this.say(text);
  }

  stop(): void {
    this.clearTimer();
    this.stopHold();
    this.current = null;
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* nothing to cancel */
    }
  }

  dispose(): void {
    this.stop();
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }

  // -------------------------------------------------------------------------

  private say(text: string): void {
    if (!this.voice || !text || !("speechSynthesis" in window)) return;
    const now = Date.now();
    const sinceAny = now - this.lastSpokenAt;
    if (sinceAny < SPEAK_GAP_MS) return;
    if (text === this.lastSpoken && sinceAny < REPEAT_MS) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      u.rate = 1.05;
      const voice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("en"));
      if (voice) u.voice = voice;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
      this.lastSpoken = text;
      this.lastSpokenAt = now;
    } catch {
      /* speech unavailable */
    }
  }

  private scheduleBeep(): void {
    const g = this.current;
    if (!g || g.beepMs === 0 || !this.sound) {
      this.timer = null;
      return;
    }
    this.tone(g.pitchHz, g.pan, 0, BEEP_MS / 1000, BEEP_GAIN);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.scheduleBeep();
    }, g.beepMs);
  }

  private tone(hz: number, pan: number, delay: number, length: number, peak: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const t = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(hz, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(peak, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
      osc.connect(gain);
      let out: AudioNode = gain;
      if (pan && typeof ctx.createStereoPanner === "function") {
        const p = ctx.createStereoPanner();
        p.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), t);
        gain.connect(p);
        out = p;
      }
      out.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + length + 0.02);
    } catch {
      /* a dropped beep is not worth an error */
    }
  }

  private startHold(g: Guidance): void {
    const ctx = this.ctx;
    if (!ctx || this.hold) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(g.pitchHz, ctx.currentTime);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(HOLD_GAIN, ctx.currentTime + 0.12);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      this.hold = { osc, gain };
    } catch {
      this.hold = null;
    }
  }

  private stopHold(): void {
    const ctx = this.ctx;
    const h = this.hold;
    this.hold = null;
    if (!ctx || !h) return;
    try {
      h.gain.gain.cancelScheduledValues(ctx.currentTime);
      h.gain.gain.setValueAtTime(Math.max(0.0001, h.gain.gain.value), ctx.currentTime);
      h.gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
      h.osc.stop(ctx.currentTime + 0.1);
    } catch {
      /* already stopped */
    }
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
