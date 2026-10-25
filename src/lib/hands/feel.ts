/**
 * Tuning knobs for how the instrument *feels*: how long a chord shape must
 * hold, how tight a fist / pinch has to be, how far the hand must swing back
 * before the next strum, and how fast two strokes may follow each other.
 *
 * These used to be constants inside the gesture controller. They now live in a
 * plain data object so the settings panel can change them live and the values
 * can be persisted — the controller only ever reads them.
 */
export type FeelTuning = {
  /** How long a finger pattern must hold before the chord changes (ms). */
  chordHoldMs: number;
  /** Grab score (0..1) that starts a fist. Higher = harder to close. */
  grabEnter: number;
  /** Thumb-tip / index-tip distance (÷ hand size) that counts as a pinch. */
  pinchEnter: number;
  /** How long a fist / open hand must hold before it counts as a strum (ms). */
  shapeConfirmMs: number;
  /** Minimum gap between two strums (ms). Lower = faster tremolo. */
  strumIntervalMs: number;
};

export const DEFAULT_FEEL: FeelTuning = {
  chordHoldMs: 110,
  grabEnter: 0.58,
  pinchEnter: 0.45,
  shapeConfirmMs: 60,
  strumIntervalMs: 95,
};

export type FeelRange = { min: number; max: number; step: number };

/** Slider ranges, shared by the settings panel and the normaliser. */
export const FEEL_RANGES: Record<keyof FeelTuning, FeelRange> = {
  chordHoldMs: { min: 40, max: 400, step: 10 },
  grabEnter: { min: 0.3, max: 0.85, step: 0.01 },
  pinchEnter: { min: 0.15, max: 0.75, step: 0.01 },
  shapeConfirmMs: { min: 0, max: 200, step: 5 },
  strumIntervalMs: { min: 40, max: 300, step: 5 },
};

export const FEEL_STORAGE_KEY = "air-guitar:feel";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function number(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Clamp + round every knob, falling back to the default for bad input. */
export function normalizeFeel(input?: Partial<FeelTuning> | null): FeelTuning {
  const source = input ?? {};
  const chordHoldMs = clamp(number(source.chordHoldMs, DEFAULT_FEEL.chordHoldMs), 40, 400);
  return {
    chordHoldMs: Math.round(chordHoldMs / 5) * 5,
    grabEnter: Math.round(clamp(number(source.grabEnter, DEFAULT_FEEL.grabEnter), 0.3, 0.85) * 100) / 100,
    pinchEnter:
      Math.round(clamp(number(source.pinchEnter, DEFAULT_FEEL.pinchEnter), 0.15, 0.75) * 100) / 100,
    shapeConfirmMs: Math.round(
      clamp(number(source.shapeConfirmMs, DEFAULT_FEEL.shapeConfirmMs), 0, 200) / 5,
    ) * 5,
    strumIntervalMs: Math.round(
      clamp(number(source.strumIntervalMs, DEFAULT_FEEL.strumIntervalMs), 40, 300),
    ),
  };
}

export function loadFeel(): FeelTuning {
  try {
    const raw = window.localStorage.getItem(FEEL_STORAGE_KEY);
    if (!raw) return DEFAULT_FEEL;
    return normalizeFeel(JSON.parse(raw) as Partial<FeelTuning>);
  } catch {
    return DEFAULT_FEEL;
  }
}

export function saveFeel(feel: FeelTuning) {
  try {
    window.localStorage.setItem(FEEL_STORAGE_KEY, JSON.stringify(feel));
  } catch {
    /* private mode / storage disabled: tuning simply is not persisted */
  }
}