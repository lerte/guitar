/**
 * Musical data for the air guitar.
 *
 * The instrument is no longer a fixed list of seven open chords: the left hand
 * picks a *scale degree* (I … vii), and the chord behind that degree comes from
 * the key and mode selected in the HUD. So this module owns
 *
 *   1. the twelve pitch classes and their spellings (C, D♭, F♯, …),
 *   2. the seven church modes and the triad quality on each degree,
 *   3. a small voicing engine that turns any (root, quality) into a playable
 *      guitar shape — the open shape when it exists, movable CAGED shapes
 *      otherwise,
 *   4. the finger-pattern → scale-degree map used by the gesture controller.
 */

/** MIDI note numbers for the six open strings, low E -> high e. */
export const TUNING_MIDI = [40, 45, 50, 55, 59, 64] as const;
export const STRING_LABELS = ["E", "A", "D", "G", "B", "e"] as const;

/** Highest capo position offered (0 = off). */
export const CAPO_RANGE = 7;

/**
 * Chord identity is its written label: "C", "F♯m", "B♭dim". The label is also
 * what the HUD prints, so a chord always reads the way it is spelled in the
 * current key.
 */
export type ChordId = string;

export type ChordQuality = "major" | "minor" | "diminished";

export type Chord = {
  id: ChordId;
  /** Spelled root, e.g. "A♭". */
  root: string;
  /** Pitch class of the root (0 = C). */
  rootPc: number;
  /** Letter index of the root (0 = C … 6 = B), used for tone spelling. */
  letter: number;
  quality: ChordQuality;
  /** Chinese quality name, e.g. 大三和弦. */
  qualityLabel: string;
  /** Fret per string (low E -> high e); -1 means the string is not played. */
  frets: number[];
  /** Lowest fret printed by the chord diagram (1 = open position). */
  baseFret: number;
  /** MIDI note per played string, low -> high. */
  midis: number[];
  /** The three chord tones, spelled from the root: F♯ · A♯ · C♯. */
  notes: string[];
  /** Pitch classes of the chord tones, used for capo transposition. */
  tonePcs: number[];
};

/* ------------------------------------------------------------------ */
/* Spelling                                                            */
/* ------------------------------------------------------------------ */

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;
const LETTER_PCS = [0, 2, 4, 5, 7, 9, 11] as const;
const ACCIDENTAL_TEXT: Record<number, string> = {
  [-2]: "♭♭",
  [-1]: "♭",
  0: "",
  1: "♯",
  2: "♯♯",
};
const ACCIDENTAL_VALUE: Record<string, number> = {
  "♭♭": -2,
  "♭": -1,
  "": 0,
  "♯": 1,
  "♯♯": 2,
};

/** Conventional spelling of each pitch class — what a guitarist expects. */
const PREFERRED_LETTER = [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6];

/** Flat-spelled note names, which is what guitarists read under a capo. */
const PITCH_NAMES_FLAT = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];

export function pitchName(pc: number) {
  return PITCH_NAMES_FLAT[((pc % 12) + 12) % 12];
}

/** Signed accidental (-2 … 2) needed to write `pc` on the given letter. */
function accidentalFor(pc: number, letter: number) {
  let diff = ((((pc - LETTER_PCS[letter]) % 12) + 12) % 12);
  if (diff > 6) diff -= 12;
  return diff;
}

function spellPitch(pc: number, letter: number) {
  const offset = accidentalFor(pc, letter);
  return LETTERS[letter] + (ACCIDENTAL_TEXT[offset] ?? "");
}

/* ------------------------------------------------------------------ */
/* Modes                                                               */
/* ------------------------------------------------------------------ */

export type ModeId =
  | "ionian"
  | "dorian"
  | "phrygian"
  | "lydian"
  | "mixolydian"
  | "aeolian"
  | "locrian";

export type Mode = {
  id: ModeId;
  /** Chinese name shown in the picker. */
  name: string;
  en: string;
  /** Semitones above the tonic. */
  intervals: readonly number[];
  /** Diatonic triad quality on degrees I … vii. */
  qualities: readonly ChordQuality[];
};

export const MODES: readonly Mode[] = [
  {
    id: "ionian",
    name: "大调",
    en: "Ionian",
    intervals: [0, 2, 4, 5, 7, 9, 11],
    qualities: ["major", "minor", "minor", "major", "major", "minor", "diminished"],
  },
  {
    id: "dorian",
    name: "多利亚",
    en: "Dorian",
    intervals: [0, 2, 3, 5, 7, 9, 10],
    qualities: ["minor", "minor", "major", "major", "minor", "diminished", "major"],
  },
  {
    id: "phrygian",
    name: "弗里吉亚",
    en: "Phrygian",
    intervals: [0, 1, 3, 5, 7, 8, 10],
    qualities: ["minor", "major", "major", "minor", "diminished", "major", "minor"],
  },
  {
    id: "lydian",
    name: "利底亚",
    en: "Lydian",
    intervals: [0, 2, 4, 6, 7, 9, 11],
    qualities: ["major", "major", "minor", "diminished", "major", "minor", "minor"],
  },
  {
    id: "mixolydian",
    name: "混合利底亚",
    en: "Mixolydian",
    intervals: [0, 2, 4, 5, 7, 9, 10],
    qualities: ["major", "minor", "diminished", "major", "minor", "minor", "major"],
  },
  {
    id: "aeolian",
    name: "小调",
    en: "Aeolian",
    intervals: [0, 2, 3, 5, 7, 8, 10],
    qualities: ["minor", "diminished", "major", "minor", "minor", "major", "major"],
  },
  {
    id: "locrian",
    name: "洛克里亚",
    en: "Locrian",
    intervals: [0, 1, 3, 5, 6, 8, 10],
    qualities: ["diminished", "major", "minor", "minor", "major", "major", "minor"],
  },
];

export const MODE_IDS: ModeId[] = MODES.map((mode) => mode.id);

export function modeById(id: string | null | undefined): Mode {
  return MODES.find((mode) => mode.id === id) ?? MODES[0];
}

/**
 * The tonic gets the letter that keeps the scale easiest to read: A♭ in
 * Ionian, but G♯ in Locrian, because "A♭ B♭♭ C♭ …" is technically right and
 * practically unreadable. The conventional letter wins close calls, so F♯
 * major stays F♯ (7 sharps) instead of turning into G♭ (6 flats).
 */
function scoreSpelling(tonicPc: number, mode: Mode, letter: number) {
  let score = 0;
  for (let degree = 0; degree < 7; degree++) {
    const pc = (tonicPc + mode.intervals[degree]) % 12;
    const absolute = Math.abs(accidentalFor(pc, (letter + degree) % 7));
    score += absolute + (absolute > 1 ? 1 : 0);
  }
  if (letter !== PREFERRED_LETTER[tonicPc]) score += 1.5;
  return score;
}

function tonicLetter(tonicPc: number, mode: Mode) {
  let best = PREFERRED_LETTER[tonicPc];
  let bestScore = scoreSpelling(tonicPc, mode, best);
  for (let letter = 0; letter < LETTERS.length; letter++) {
    if (letter === best) continue;
    const score = scoreSpelling(tonicPc, mode, letter);
    if (score < bestScore) {
      best = letter;
      bestScore = score;
    }
  }
  return best;
}

export type ScaleDegree = {
  /** Pitch class of the chord root. */
  pc: number;
  /** Spelled root, e.g. "B♭". */
  name: string;
  quality: ChordQuality;
  /** Chord label, e.g. "B♭dim". */
  chord: ChordId;
  /** Roman numeral, e.g. "vii°". */
  roman: string;
};

export type KeyScale = {
  tonicPc: number;
  mode: Mode;
  /** Spelled tonic, e.g. "F♯". */
  tonic: string;
  /** Full label, e.g. "F♯ 大调". */
  label: string;
  /** The seven scale notes, spelled. */
  notes: string[];
  degrees: ScaleDegree[];
  chords: ChordId[];
};

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

const keyCache = new Map<string, KeyScale>();

/** Key scale + the seven diatonic chords, memoised per (tonic, mode). */
export function keyScale(tonicPc: number, modeId: ModeId): KeyScale {
  const pc = ((tonicPc % 12) + 12) % 12;
  const mode = modeById(modeId);
  const cacheKey = `${pc}:${mode.id}`;
  const cached = keyCache.get(cacheKey);
  if (cached) return cached;

  const letter = tonicLetter(pc, mode);
  const degrees: ScaleDegree[] = mode.intervals.map((interval, index) => {
    const degreePc = (pc + interval) % 12;
    const name = spellPitch(degreePc, (letter + index) % 7);
    const quality = mode.qualities[index];
    const base = ROMAN[index];
    const roman =
      quality === "major" ? base : quality === "minor" ? base.toLowerCase() : `${base.toLowerCase()}°`;
    return {
      pc: degreePc,
      name,
      quality,
      chord: `${name}${QUALITY_SUFFIX[quality]}`,
      roman,
    };
  });

  const scale: KeyScale = {
    tonicPc: pc,
    mode,
    tonic: spellPitch(pc, letter),
    label: `${spellPitch(pc, letter)} ${mode.name}`,
    notes: degrees.map((degree) => degree.name),
    degrees,
    chords: degrees.map((degree) => degree.chord),
  };
  keyCache.set(cacheKey, scale);
  return scale;
}

/** The seven diatonic chord labels of a key + mode. */
export function keyChords(tonicPc: number, modeId: ModeId): ChordId[] {
  return keyScale(tonicPc, modeId).chords;
}

export function keyLabel(tonicPc: number, modeId: ModeId) {
  return keyScale(tonicPc, modeId).label;
}

/* ------------------------------------------------------------------ */
/* Voicings                                                            */
/* ------------------------------------------------------------------ */

const QUALITY_INTERVALS: Record<ChordQuality, readonly number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
};

const QUALITY_SUFFIX: Record<ChordQuality, string> = {
  major: "",
  minor: "m",
  diminished: "dim",
};

const QUALITY_LABEL: Record<ChordQuality, string> = {
  major: "大三和弦",
  minor: "小三和弦",
  diminished: "减三和弦",
};

/** Intervals from the root to the chord tones, in degrees: root, third, fifth. */
const TONE_LETTERS = [0, 2, 4];

type ShapeTemplate = {
  /** Fret offsets from the root fret; -1 mutes the string. */
  frets: number[];
  /** String that carries the root (0 = low E). */
  rootString: number;
};

const MOVABLE_MAJOR: readonly ShapeTemplate[] = [
  { frets: [0, 2, 2, 1, 0, 0], rootString: 0 }, // E shape
  { frets: [-1, 0, 2, 2, 2, 0], rootString: 1 }, // A shape
  { frets: [-1, -1, 0, 2, 3, 2], rootString: 2 }, // D shape
];

const MOVABLE_MINOR: readonly ShapeTemplate[] = [
  { frets: [0, 2, 2, 0, 0, 0], rootString: 0 }, // Em shape
  { frets: [-1, 0, 2, 2, 1, 0], rootString: 1 }, // Am shape
  { frets: [-1, -1, 0, 2, 3, 1], rootString: 2 }, // Dm shape
];

const MOVABLE_DIM: readonly ShapeTemplate[] = [
  { frets: [0, 1, 2, 0, -1, -1], rootString: 0 }, // E shape
  { frets: [-1, 0, 1, 2, 1, -1], rootString: 1 }, // A shape
  { frets: [-1, -1, 0, 1, 3, 1], rootString: 2 }, // D shape
];

/** Open-position shapes, keyed by "pitchClass:quality". These sound best. */
const OPEN_SHAPES: Record<string, number[]> = {
  "0:major": [-1, 3, 2, 0, 1, 0], // C
  "2:major": [-1, -1, 0, 2, 3, 2], // D
  "4:major": [0, 2, 2, 1, 0, 0], // E
  "5:major": [1, 3, 3, 2, 1, 1], // F
  "7:major": [3, 2, 0, 0, 0, 3], // G
  "9:major": [-1, 0, 2, 2, 2, 0], // A
  "2:minor": [-1, -1, 0, 2, 3, 1], // Dm
  "4:minor": [0, 2, 2, 0, 0, 0], // Em
  "9:minor": [-1, 0, 2, 2, 1, 0], // Am
};

/** Lower is easier: low frets win, open strings help, muted strings hurt. */
function shapeCost(frets: number[]) {
  let highest = 0;
  let muted = 0;
  let open = 0;
  for (const fret of frets) {
    if (fret < 0) muted += 1;
    else if (fret === 0) open += 1;
    else highest = Math.max(highest, fret);
  }
  return highest + muted * 0.55 - open * 0.35;
}

const voicingCache = new Map<string, number[]>();

function voicingFor(pc: number, quality: ChordQuality): number[] {
  const cacheKey = `${pc}:${quality}`;
  const cached = voicingCache.get(cacheKey);
  if (cached) return cached;

  const candidates: number[][] = [];
  const open = OPEN_SHAPES[cacheKey];
  if (open) candidates.push(open);

  const templates =
    quality === "major" ? MOVABLE_MAJOR : quality === "minor" ? MOVABLE_MINOR : MOVABLE_DIM;
  for (const template of templates) {
    const rootFret = (pc - (TUNING_MIDI[template.rootString] % 12) + 12) % 12;
    const frets = template.frets.map((fret) => (fret < 0 ? -1 : fret + rootFret));
    const highest = Math.max(...frets.filter((fret) => fret >= 0));
    if (highest > 12) continue; // past the useful part of the neck
    candidates.push(frets);
  }

  let best = candidates[0];
  let bestCost = shapeCost(best);
  for (const candidate of candidates.slice(1)) {
    const cost = shapeCost(candidate);
    if (cost < bestCost) {
      best = candidate;
      bestCost = cost;
    }
  }

  voicingCache.set(cacheKey, best);
  return best;
}

/** First fret the chord diagram draws: the nut for near-open shapes, else the hand position. */
function baseFretFor(frets: number[]) {
  const played = frets.filter((fret) => fret > 0);
  if (played.length === 0) return 1;
  const highest = Math.max(...played);
  return highest <= 4 ? 1 : Math.min(...played);
}

function buildChord(id: ChordId, letter: number, pc: number, quality: ChordQuality): Chord {
  const frets = voicingFor(pc, quality);
  const midis = frets
    .map((fret, string) => (fret < 0 ? null : TUNING_MIDI[string] + fret))
    .filter((midi): midi is number => midi !== null);
  const tonePcs = QUALITY_INTERVALS[quality].map((interval) => (pc + interval) % 12);
  const notes = tonePcs.map((tonePc, index) => spellPitch(tonePc, (letter + TONE_LETTERS[index]) % 7));

  return {
    id,
    root: spellPitch(pc, letter),
    rootPc: pc,
    letter,
    quality,
    qualityLabel: QUALITY_LABEL[quality],
    frets,
    baseFret: baseFretFor(frets),
    midis,
    notes,
    tonePcs,
  };
}

const CHORD_LABEL_RE = /^([A-G])([♯♭]{0,2})(dim|m)?$/;

function parseChordLabel(label: string) {
  const match = CHORD_LABEL_RE.exec(label.trim());
  if (!match) return null;
  const letter = LETTERS.indexOf(match[1] as (typeof LETTERS)[number]);
  if (letter < 0) return null;
  const accidental = ACCIDENTAL_VALUE[match[2] ?? ""];
  if (accidental === undefined) return null;
  const pc = (((LETTER_PCS[letter] + accidental) % 12) + 12) % 12;
  const quality: ChordQuality =
    match[3] === "dim" ? "diminished" : match[3] === "m" ? "minor" : "major";
  return { letter, pc, quality };
}

const chordCache = new Map<ChordId, Chord>();

/**
 * Resolve a chord label to its voicing. Labels are pure musical data, so this
 * is deterministic: "F♯m" is always the same shape, whichever key spelled it.
 */
export function getChord(label: ChordId | null | undefined): Chord | null {
  if (!label) return null;
  const cached = chordCache.get(label);
  if (cached) return cached;
  const parsed = parseChordLabel(label);
  if (!parsed) return null;
  const chord = buildChord(label, parsed.letter, parsed.pc, parsed.quality);
  chordCache.set(label, chord);
  return chord;
}

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
  const frets = getChord(chord)?.frets;
  if (!frets) return null;
  const fret = frets[index];
  if (fret === undefined || fret < 0) return null;
  const midi = TUNING_MIDI[index] + fret;
  return { midi, note: pitchName(midi) };
}

/* ------------------------------------------------------------------ */
/* 变调夹 (capo): shapes stay the same, everything sounds N semitones up. */
/* ------------------------------------------------------------------ */

/** The chord symbol that actually sounds for a shape with a capo at N frets. */
export function transposeChordLabel(chord: Chord, semitones: number) {
  if (semitones === 0) return chord.id;
  return `${pitchName(chord.rootPc + semitones)}${QUALITY_SUFFIX[chord.quality]}`;
}

/** Sounding chord tones for a shape with a capo at N frets. */
export function transposedNotes(chord: Chord, semitones: number) {
  return chord.tonePcs.map((pc) => pitchName(pc + semitones));
}

/** Nearest string the chord actually plays (prefers lower pitch), or null. */
export function playableString(chord: ChordId, index: number): number | null {
  const frets = getChord(chord)?.frets;
  if (!frets) return null;
  if ((frets[index] ?? -1) >= 0) return index;
  for (let delta = 1; delta < 6; delta++) {
    if (index - delta >= 0 && (frets[index - delta] ?? -1) >= 0) return index - delta;
    if (index + delta < 6 && (frets[index + delta] ?? -1) >= 0) return index + delta;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Gestures: one hand shape per scale degree, fist = 切音.              */
/* ------------------------------------------------------------------ */

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
 * Exact bit patterns → scale degree (0 = I … 6 = vii), `null` = palm mute.
 *
 * Exact patterns come first (so `👍` and `🤙` are distinguishable), then a
 * forgiving finger-count fallback keeps the instrument playable when thumb
 * detection is uncertain. One finger per degree: 1–5 fingers are I–V, a lone
 * thumb is vi, thumb + pinky is vii.
 */
const PATTERN_TO_DEGREE: Record<string, number | null> = {
  "00000": null,
  "01000": 0,
  "01100": 1,
  "01110": 2,
  "01111": 3,
  "11111": 4,
  "10000": 5,
  "10001": 6,
};

const COUNT_TO_DEGREE: Array<number | null> = [null, 0, 1, 2, 3, 4];

/** Resolve a finger pattern to a scale degree (0 … 6), or null for 切音. */
export function resolveDegree(pattern: FingerPattern): number | null {
  const key = patternKey(pattern);
  if (key in PATTERN_TO_DEGREE) return PATTERN_TO_DEGREE[key];
  const count = countExtended(pattern);
  return COUNT_TO_DEGREE[Math.min(count, COUNT_TO_DEGREE.length - 1)] ?? null;
}

export type GestureSlot = {
  pattern: string;
  emoji: string;
  label: string;
  hint: string;
  /** 0 = I … 6 = vii; null = palm mute. */
  degree: number | null;
};

/** The eight left-hand shapes, in the order the guide card shows them. */
export const GESTURE_SLOTS: GestureSlot[] = [
  { pattern: "01000", emoji: "☝️", label: "1 指", hint: "食指", degree: 0 },
  { pattern: "01100", emoji: "✌️", label: "2 指", hint: "食指 + 中指", degree: 1 },
  { pattern: "01110", emoji: "🤟", label: "3 指", hint: "食指 + 中指 + 无名指", degree: 2 },
  { pattern: "01111", emoji: "🖖", label: "4 指", hint: "食指到小指", degree: 3 },
  { pattern: "11111", emoji: "🖐️", label: "5 指", hint: "五指张开", degree: 4 },
  { pattern: "10000", emoji: "👍", label: "拇指", hint: "只竖拇指", degree: 5 },
  { pattern: "10001", emoji: "🤙", label: "拇+小指", hint: "摇滚手势", degree: 6 },
  { pattern: "00000", emoji: "✊", label: "握拳", hint: "切音", degree: null },
];
