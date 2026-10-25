import type { GuitarEngine } from "./audio-engine";
import { playableString, type ChordId } from "./chords";

/**
 * Fingerpicking patterns ("分解和弦"), written the way Chinese guitar tabs do:
 * 53231323 means pluck 5th string, 3rd, 2nd, 3rd, 1st, 3rd, 2nd, 3rd — one step
 * per eighth note, 1 = high e, 6 = low E.
 */
export type ArpeggioPattern = {
  id: string;
  name: string;
  steps: number[];
  hint: string;
};

export const ARPEGGIO_PATTERNS: ArpeggioPattern[] = [
  { id: "classic", name: "53231323", steps: [5, 3, 2, 3, 1, 3, 2, 3], hint: "最常用的八分音符分解" },
  { id: "bass6", name: "63231323", steps: [6, 3, 2, 3, 1, 3, 2, 3], hint: "低音落在六弦，更沉" },
  { id: "waltz", name: "532313", steps: [5, 3, 2, 3, 1, 3], hint: "三拍子圆舞曲型" },
  { id: "half", name: "5-3-2-3", steps: [5, 3, 2, 3], hint: "半分解，慢速铺底" },
];

/**
 * A lookahead scheduler for automatic fingerpicking.
 *
 * Steps are scheduled slightly ahead on the Web Audio clock (the approach a DAW
 * uses) so the rhythm does not inherit `setInterval` jitter, and a chord change
 * mid-bar is picked up on the next step.
 */
export class ArpeggioPlayer {
  private engine: GuitarEngine;
  private chordSource: () => ChordId | null;
  private timer: number | null = null;
  private step = 0;
  private nextTime = 0;

  bpm = 84;
  patternIndex = 0;
  velocity = 0.62;

  constructor(engine: GuitarEngine, chordSource: () => ChordId | null) {
    this.engine = engine;
    this.chordSource = chordSource;
  }

  get playing() {
    return this.timer !== null;
  }

  start() {
    if (this.timer !== null) return;
    const ctx = this.engine.context;
    if (!ctx) return;
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.08;
    this.timer = window.setInterval(() => this.tick(), 25);
  }

  stop() {
    if (this.timer === null) return;
    window.clearInterval(this.timer);
    this.timer = null;
  }

  private tick() {
    const ctx = this.engine.context;
    if (!ctx) return;
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.02;

    const horizon = ctx.currentTime + 0.12;
    const pattern = ARPEGGIO_PATTERNS[this.patternIndex] ?? ARPEGGIO_PATTERNS[0];
    const interval = 30 / Math.max(40, this.bpm); // eighth note
    let guard = 0;

    while (this.nextTime < horizon && guard < 16) {
      const chord = this.chordSource();
      const stringNumber = pattern.steps[this.step % pattern.steps.length];
      if (chord) {
        // Chords like D / Dm mute the low strings; shift those steps to the
        // closest playable string so the bass note still lands.
        const index = playableString(chord, 6 - stringNumber);
        if (index !== null) this.engine.pluck(chord, index, this.velocity, this.nextTime);
      }
      this.step += 1;
      this.nextTime += interval;
      guard += 1;
    }
  }
}
