import { resolveChord, type ChordId } from "@/lib/guitar/chords";
import type { StrumDirection } from "@/lib/guitar/audio-engine";
import { DEFAULT_FEEL, normalizeFeel, type FeelTuning } from "./feel";
import { clamp, type HandAnalysis, type Landmark } from "./landmarks";

export type Handedness = "Left" | "Right";

export type TrackedHand = {
  /** Physical hand after the user's left/right swap preference. */
  handedness: Handedness;
  score: number;
  landmarks: Landmark[];
  analysis: HandAnalysis;
};

export type StrumEvent = {
  direction: StrumDirection;
  velocity: number;
  at: number;
};

/** 扫弦 (strum) or 分解和弦 (fingerpicking). */
export type PlayMode = "strum" | "pick";

export type PluckEvent = {
  /** Engine string index: 0 = low E, 5 = high e. */
  stringIndex: number;
  velocity: number;
  at: number;
};

export type GestureState = {
  /** Debounced chord currently selected by the left hand; null = muted. */
  chord: ChordId | null;
  /** Raw extended-finger count (instant feedback, no debounce). */
  fingers: number;
  pattern: string;
  left: TrackedHand | null;
  right: TrackedHand | null;
  grabbing: boolean;
  grabScore: number;
  lastStrum: StrumEvent | null;
  chordChangedAt: number;
  mode: PlayMode;
  /** String under the right hand while in pick mode (engine index). */
  targetString: number | null;
  /** Pinch / grab is held, i.e. a pluck is being articulated. */
  engaging: boolean;
  lastPluck: PluckEvent | null;
};

type Options = {
  onChord: (chord: ChordId | null, info: { fingers: number; pattern: string }) => void;
  onStrum: (event: StrumEvent) => void;
  onPluck: (event: PluckEvent) => void;
};

/**
 * Chord hold, grab / pinch sensitivity, strum return distance and the minimum
 * strum interval are user-tunable at runtime — see `./feel` and `setTuning()`.
 */
/** Grace period before a vanished chord hand is treated as "release the mute". */
const HAND_LOST_MS = 380;



/* ---------------- 分解和弦 (fingerpicking) ---------------- */


/** The right hand's vertical position maps onto the strings in this band. */
export const STRING_BAND = { top: 0.16, bottom: 0.74 } as const;
const STRING_TOP = STRING_BAND.top;
const STRING_BOTTOM = STRING_BAND.bottom;
/** Two plucks closer than this are treated as one (tremolo guard). */
const PLUCK_MIN_INTERVAL_MS = 45;

/**
 * Temporal gesture logic.
 *
 * Frames are noisy: a finger flickers, a palm drifts. The controller debounces
 * chord selection, adds hysteresis to the grab, and converts right-hand motion
 * into discrete strum events with direction and velocity.
 */
export class GestureController {
  private options: Options;

  private chord: ChordId | null = "C";
  private lastSoundingChord: ChordId = "C";
  private pendingChord: ChordId | null = "C";
  private pendingSince = 0;
  private fingers = 0;
  private pattern = "01000";
  private chordChangedAt = 0;
  private leftLostAt = 0;

  private leftHand: TrackedHand | null = null;
  private rightHand: TrackedHand | null = null;

  /** Strum hand shape: fist (downstroke) or open hand (upstroke). */
  private grabbing = false;
  private grabScore = 0;
  private shapeState: "fist" | "open" | null = null;
  private shapeCandidate: "fist" | "open" | null = null;
  private shapeCandidateSince = 0;
  private lastY: number | null = null;
  /** Smoothed vertical speed (normalised units / ms) for stroke velocity. */
  private moveSpeed = 0;
  private lastStrumAt = 0;
  private lastStrum: StrumEvent | null = null;
  private lastUpdateAt = 0;

  private mode: PlayMode = "strum";
  private feel: FeelTuning = DEFAULT_FEEL;
  private feelSource: FeelTuning | null = null;
  /** Derived hysteresis bands (not user-facing, kept in sync by setTuning). */
  private grabExit = 0.36;
  private pinchExit = 0.72;
  private muteHoldMs = 70;
  private targetString: number | null = null;
  private engaging = false;
  private lastBand: number | null = null;
  private lastPickString: number | null = null;
  private lastPluckAt = 0;
  private lastPluck: PluckEvent | null = null;

  constructor(options: Options) {
    this.options = options;
  }

  get state(): GestureState {
    return {
      chord: this.chord,
      fingers: this.fingers,
      pattern: this.pattern,
      left: this.leftHand,
      right: this.rightHand,
      grabbing: this.grabbing,
      grabScore: this.grabScore,
      lastStrum: this.lastStrum,
      chordChangedAt: this.chordChangedAt,
      mode: this.mode,
      targetString: this.targetString,
      engaging: this.engaging,
      lastPluck: this.lastPluck,
    };
  }

  /** Live tuning from the settings panel; a cheap no-op when nothing changed. */
  setTuning(feel: FeelTuning) {
    if (this.feelSource === feel) return;
    this.feelSource = feel;
    this.feel = normalizeFeel(feel);
    // Hysteresis bands are derived so each slider stays a single number.
    this.grabExit = Math.max(0.15, this.feel.grabEnter - 0.22);
    this.pinchExit = Math.min(0.95, this.feel.pinchEnter + 0.27);
    this.muteHoldMs = Math.max(40, this.feel.chordHoldMs * 0.64);
  }

  /** Switching technique resets the right-hand state machines. */
  setMode(mode: PlayMode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.grabbing = false;
    this.lastY = null;
    this.shapeState = null;
    this.shapeCandidate = null;
    this.engaging = false;
    this.targetString = null;
    this.lastBand = null;
    this.lastPickString = null;
  }

  reset() {
    this.grabbing = false;
    this.grabScore = 0;
    this.leftHand = null;
    this.rightHand = null;
    this.lastY = null;
    this.shapeState = null;
    this.shapeCandidate = null;
    this.lastUpdateAt = 0;
    this.leftLostAt = 0;
    this.engaging = false;
    this.targetString = null;
    this.lastBand = null;
    this.lastPickString = null;
  }

  update(hands: TrackedHand[], now: number): GestureState {
    const dt = this.lastUpdateAt ? now - this.lastUpdateAt : 16;
    this.lastUpdateAt = now;

    const left = hands.find((hand) => hand.handedness === "Left") ?? null;
    const right = hands.find((hand) => hand.handedness === "Right") ?? null;

    this.leftHand = left;
    if (left) {
      this.leftLostAt = 0;
      this.updateChord(left, now);
    } else {
      this.handleChordHandLost(now);
    }

    if (right) {
      if (this.mode === "pick") {
        this.updatePick(right, now, dt);
      } else {
        this.updateStrum(right, now, dt);
      }
    } else {
      this.rightHand = null;
      this.grabbing = false;
      this.grabScore = 0;
      this.lastY = null;
      this.shapeState = null;
      this.shapeCandidate = null;
      this.engaging = false;
      this.lastPickString = null;
      this.targetString = null;
    }

    return this.state;
  }

  private updateChord(hand: TrackedHand, now: number) {
    const next = resolveChord(hand.analysis.fingers);
    this.fingers = hand.analysis.extendedCount;
    this.pattern = hand.analysis.pattern;

    if (next === this.chord) {
      this.pendingChord = next;
      this.pendingSince = 0;
      return;
    }

    if (next !== this.pendingChord) {
      this.pendingChord = next;
      this.pendingSince = now;
      return;
    }

    const hold = next === null ? this.muteHoldMs : this.feel.chordHoldMs;
    if (this.pendingSince && now - this.pendingSince >= hold) {
      this.applyChord(next, now);
      this.pendingSince = 0;
    }
  }

  private applyChord(next: ChordId | null, now: number) {
    const changed = next !== this.chord;
    this.chord = next;
    if (next) this.lastSoundingChord = next;
    if (!changed) return;
    this.chordChangedAt = now;
    this.options.onChord(next, { fingers: this.fingers, pattern: this.pattern });
  }

  /** Losing the chord hand releases a palm mute but keeps the last chord. */
  private handleChordHandLost(now: number) {
    if (!this.leftLostAt) this.leftLostAt = now;
    this.fingers = 0;
    if (this.chord === null && now - this.leftLostAt > HAND_LOST_MS) {
      this.applyChord(this.lastSoundingChord, now);
    }
  }

  /**
   * 扫弦: the hand shape *is* the stroke — closing the fist strums down,
   * opening the hand strums up. Directions therefore always alternate, and a
   * held shape can never repeat the same stroke.
   */
  private updateStrum(hand: TrackedHand, now: number, dt: number) {
    this.rightHand = hand;
    const { analysis } = hand;
    const score = analysis.grabScore;
    this.grabScore = score;
    const y = analysis.palm.y;

    const dy = y - (this.lastY ?? y);
    this.lastY = y;
    const speed = dt > 0 ? Math.abs(dy) / dt : 0;
    this.moveSpeed = this.moveSpeed * 0.75 + speed * 0.25;

    // Wide hysteresis: a fist needs a strong grab score and the open hand has
    // to relax well past the release band, so a hand hovering in between does
    // not flicker between the two strokes.
    const candidate =
      score > this.feel.grabEnter ? "fist" : score < this.grabExit ? "open" : null;
    if (!candidate) return;

    // The first shape after the hand appears is adopted immediately: there is
    // no stroke to fire yet, and waiting would swallow the first one.
    if (this.shapeState === null) {
      this.shapeState = candidate;
      this.shapeCandidate = null;
      this.grabbing = candidate === "fist";
      return;
    }

    if (candidate !== this.shapeCandidate) {
      this.shapeCandidate = candidate;
      this.shapeCandidateSince = now;
    }
    if (now - this.shapeCandidateSince < this.feel.shapeConfirmMs) return;
    if (candidate === this.shapeState) return;

    const previous = this.shapeState;
    this.shapeState = candidate;
    this.shapeCandidate = null;
    this.grabbing = candidate === "fist";

    // Adopting the first shape after the hand appears is not a stroke.
    if (previous === null) return;
    if (now - this.lastStrumAt < this.feel.strumIntervalMs) return;

    this.fireStrum(candidate === "fist" ? "down" : "up", this.strumVelocity(), now);
  }

  /** Louder when the hand is moving: a quick flick sounds like a hard strum. */
  private strumVelocity() {
    return clamp(0.55 + this.moveSpeed * 300, 0.55, 1);
  }

  /**
   * 分解和弦: the right hand's height selects a string, and a pinch (thumb +
   * index) or a fist plucks it. Sliding the engaged hand across strings
   * articulates an arpeggio by hand.
   */
  private updatePick(hand: TrackedHand, now: number, dt: number) {
    this.rightHand = hand;
    const { analysis } = hand;
    this.grabScore = analysis.grabScore;

    const stringIndex = this.bandFromY(analysis.palm.y);
    this.targetString = stringIndex;

    const dy = analysis.palm.y - (this.lastY ?? analysis.palm.y);
    this.lastY = analysis.palm.y;
    const speed = dt > 0 ? Math.abs(dy) / dt : 0;
    const velocity = clamp(0.5 + speed * 140, 0.5, 1);

    const pinchNear = analysis.pinch < this.feel.pinchEnter;
    const fistNear = analysis.grabScore > this.feel.grabEnter;

    if (!this.engaging) {
      if (pinchNear || fistNear) {
        this.engaging = true;
        if (this.firePluck(stringIndex, Math.max(0.6, velocity), now)) {
          this.lastPickString = stringIndex;
        }
      }
      return;
    }

    const released = analysis.pinch > this.pinchExit && analysis.grabScore < this.grabExit;
    if (released) {
      this.engaging = false;
      this.lastPickString = null;
      return;
    }

    // Crossed onto another string while still engaged: pluck that one as well.
    // If the tremolo guard swallowed it, retry on the next frame.
    if (this.lastPickString !== stringIndex) {
      if (this.firePluck(stringIndex, velocity, now)) {
        this.lastPickString = stringIndex;
      }
    }
  }

  /**
   * Right-hand height -> string, with a dead zone at band edges so a hand
   * resting exactly on a boundary does not machine-gun plucks.
   */
  private bandFromY(y: number): number {
    const t = clamp((y - STRING_TOP) / (STRING_BOTTOM - STRING_TOP), 0, 0.99999);
    const position = t * 6;
    let band = Math.floor(position);
    const inside = position - band;
    // Dead zone only between neighbouring bands: a fast jump of several
    // strings must still register even if it lands near a band edge.
    if (
      this.lastBand !== null &&
      Math.abs(band - this.lastBand) === 1 &&
      (inside < 0.16 || inside > 0.84)
    ) {
      band = this.lastBand;
    }
    this.lastBand = band;
    return 5 - band; // top of the frame = high e
  }

  private firePluck(stringIndex: number, velocity: number, now: number) {
    if (now - this.lastPluckAt < PLUCK_MIN_INTERVAL_MS) return false;
    this.lastPluckAt = now;
    const event: PluckEvent = { stringIndex, velocity, at: now };
    this.lastPluck = event;
    this.options.onPluck(event);
    return true;
  }


  private fireStrum(direction: StrumDirection, velocity: number, now: number) {
    this.lastStrumAt = now;
    const event: StrumEvent = { direction, velocity, at: now };
    this.lastStrum = event;
    this.options.onStrum(event);
  }
}
