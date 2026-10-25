/**
 * Musical data: standard-tuning guitar, open-position chord shapes, and the
 * left-hand finger patterns that select them.
 */

/** MIDI note numbers for the six open strings, low E -> high e. */
export const TUNING_MIDI = [40, 45, 50, 55, 59, 64] as const;
export const STRING_LABELS = ["E", "A", "D", "G", "B", "e"] as const;

export type ChordId = "C" | "G" | "Am" | "F" | "Em" | "D" | "Dm";

export type Chord = {
  id: ChordId;
  root: string;
  quality: string;
  /** Fret per string (low E -> high e); -1 means the string is not played. */
  frets: number[];
  /** MIDI note per played string, low -> high. */
  midis: number[];
  notes: string[];
};

const PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const SHAPES: Record<ChordId, { quality: string; frets: number[] }> = {
  C: { quality: "大三和弦", frets: [-1, 3, 2, 0, 1, 0] },
  G: { quality: "大三和弦", frets: [3, 2, 0, 0, 0, 3] },
  Am: { quality: "小三和弦", frets: [-1, 0, 2, 2, 1, 0] },
  F: { quality: "大三和弦", frets: [1, 3, 3, 2, 1, 1] },
  Em: { quality: "小三和弦", frets: [0, 2, 2, 0, 0, 0] },
  D: { quality: "大三和弦", frets: [-1, -1, 0, 2, 3, 2] },
  Dm: { quality: "小三和弦", frets: [-1, -1, 0, 2, 3, 1] },
};

function buildChord(id: ChordId): Chord {
  const { quality, frets } = SHAPES[id];
  const midis = frets
    .map((fret, string) => (fret < 0 ? null : TUNING_MIDI[string] + fret))
    .filter((midi): midi is number => midi !== null);
  const notes = midis.map((midi) => PITCH_CLASSES[midi % 12]);
  return { id, root: PITCH_CLASSES[midis[0] % 12], quality, frets, midis, notes };
}

export const CHORDS = Object.fromEntries(
  (Object.keys(SHAPES) as ChordId[]).map((id) => [id, buildChord(id)]),
) as Record<ChordId, Chord>;

export const CHORD_ORDER: ChordId[] = ["C", "G", "Am", "F", "Em", "D", "Dm"];

export function midiToFrequency(midi: number) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/* ------------------------------------------------------------------ */
/* String helpers: engine index 0 = low E, human number 6 = low E.      */
/* ------------------------------------------------------------------ */

export function stringNumber(index: number) {
  return 6 - index;
}

export function stringLabel(index: number) {
  return STRING_LABELS[index] ?? "";
}

export type StringNote = { midi: number; note: string };

/** The note a chord sounds on a given string, or null when the string is muted. */
export function chordStringNote(chord: ChordId, index: number): StringNote | null {
  const frets = CHORDS[chord]?.frets;
  if (!frets) return null;
  const fret = frets[index];
  if (fret === undefined || fret < 0) return null;
  const midi = TUNING_MIDI[index] + fret;
  return { midi, note: PITCH_CLASSES[midi % 12] };
}

/* ------------------------------------------------------------------ */
/* 变调夹 (capo): shapes stay the same, everything sounds N semitones up. */
/* ------------------------------------------------------------------ */

/** Highest capo position offered (0 = off). */
export const CAPO_RANGE = 7;

/** Flat-spelled note names, which is what guitarists read under a capo. */
const PITCH_NAMES_FLAT = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];

export function pitchName(midi: number) {
  return PITCH_NAMES_FLAT[((midi % 12) + 12) % 12];
}

/** The chord symbol that actually sounds for a shape with a capo at N frets. */
export function transposeChordLabel(chord: ChordId, semitones: number) {
  if (semitones === 0) return chord;
  const index = PITCH_CLASSES.indexOf(CHORDS[chord].root);
  const name = PITCH_NAMES_FLAT[(((index < 0 ? 0 : index) + semitones) % 12 + 12) % 12];
  return `${name}${chord.endsWith("m") ? "m" : ""}`;
}

/** Sounding note names for a shape with a capo at N frets. */
export function transposedNotes(chord: ChordId, semitones: number) {
  return CHORDS[chord].midis.map((midi) => pitchName(midi + semitones));
}

/** Nearest string the chord actually plays (prefers lower pitch), or null. */
export function playableString(chord: ChordId, index: number): number | null {
  const frets = CHORDS[chord]?.frets;
  if (!frets) return null;
  if (frets[index] >= 0) return index;
  for (let delta = 1; delta < 6; delta++) {
    if (index - delta >= 0 && frets[index - delta] >= 0) return index - delta;
    if (index + delta < 6 && frets[index + delta] >= 0) return index + delta;
  }
  return null;
}

export type FingerPattern = {
  thumb: boolean;
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
};

export const FINGER_KEYS = ["thumb", "index", "middle", "ring", "pinky"] as const;
export type FingerKey = (typeof FINGER_KEYS)[number];

/** "01100" style key, ordered thumb -> index -> middle -> ring -> pinky. */
export function patternKey(pattern: FingerPattern) {
  return FINGER_KEYS.map((key) => (pattern[key] ? "1" : "0")).join("");
}


export function countExtended(pattern: FingerPattern) {
  return FINGER_KEYS.reduce((total, key) => total + (pattern[key] ? 1 : 0), 0);
}

/**
 * Gesture -> chord. `null` means a closed fist: palm mute / 切音.
 *
 * Exact bit patterns come first (so `👍` and `🤙` are distinguishable), then a
 * forgiving finger-count fallback keeps the instrument playable when the thumb
 * detection is uncertain.
 */
const PATTERN_TO_CHORD: Record<string, ChordId | null> = {
  "00000": null,
  "01000": "C",
  "01100": "G",
  "01110": "Am",
  "01111": "F",
  "11111": "Em",
  "10000": "Dm",
  "10001": "D",
};

const COUNT_TO_CHORD: Array<ChordId | null> = [null, "C", "G", "Am", "F", "Em"];

export function resolveChord(pattern: FingerPattern): ChordId | null {
  const key = patternKey(pattern);
  if (key in PATTERN_TO_CHORD) return PATTERN_TO_CHORD[key];
  const count = countExtended(pattern);
  const byCount = COUNT_TO_CHORD[Math.min(count, COUNT_TO_CHORD.length - 1)];
  return byCount ?? null;
}

export type GestureEntry = {
  /** Key into PATTERN_TO_CHORD. */
  pattern: string;
  chord: ChordId | null;
  emoji: string;
  label: string;
  hint: string;
};

export const GESTURE_GUIDE: GestureEntry[] = [
  { pattern: "01000", chord: "C", emoji: "☝️", label: "1 指", hint: "食指" },
  { pattern: "01100", chord: "G", emoji: "✌️", label: "2 指", hint: "食指 + 中指" },
  { pattern: "01110", chord: "Am", emoji: "🤟", label: "3 指", hint: "食指 + 中指 + 无名指" },
  { pattern: "01111", chord: "F", emoji: "🖖", label: "4 指", hint: "食指到小指" },
  { pattern: "11111", chord: "Em", emoji: "🖐️", label: "5 指", hint: "五指张开" },
  { pattern: "10000", chord: "Dm", emoji: "👍", label: "拇指", hint: "只竖拇指" },
  { pattern: "10001", chord: "D", emoji: "🤙", label: "拇+小指", hint: "摇滚手势" },
  { pattern: "00000", chord: null, emoji: "✊", label: "握拳", hint: "切音" },
];


