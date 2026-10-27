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

export type ChordQuality =
  | "major"
  | "minor"
  | "diminished"
  | "major7"
  | "minor7"
  | "dominant7"
  | "halfDiminished7"
  | "diminished7"
  | "major9"
  | "minor9"
  | "dominant9"
  | "halfDiminished9";

/** How much color the seven diatonic chords of a key carry. */
export type ChordExtension = "triad" | "seventh" | "ninth";

export const CHORD_EXTENSIONS: readonly {
  id: ChordExtension;
  name: string;
  hint: string;
}[] = [
  { id: "triad", name: "三和弦", hint: "根音 · 三音 · 五音" },
  { id: "seventh", name: "七和弦", hint: "在三和弦上加入七音" },
  { id: "ninth", name: "九和弦", hint: "在七和弦上再加入九音" },
];

export const EXTENSION_IDS: readonly ChordExtension[] = CHORD_EXTENSIONS.map((entry) => entry.id);

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
  /** The chord tones, spelled from the root: F♯ · A♯ · C♯. */
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
  /** Roman numeral, e.g. "vii°" or "V7". */
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

type SeventhQuality = "major7" | "minor7" | "dominant7" | "halfDiminished7";

const NINTH_OF_SEVENTH: Record<SeventhQuality, ChordQuality> = {
  major7: "major9",
  minor7: "minor9",
  dominant7: "dominant9",
  halfDiminished7: "halfDiminished9",
};

/** Semitones from a scale degree up to the diatonic seventh above it. */
function seventhInterval(mode: Mode, index: number) {
  const root = mode.intervals[index];
  const wrap = index + 6 >= 7 ? 12 : 0;
  return mode.intervals[(index + 6) % 7] + wrap - root;
}

/**
 * Turn a diatonic triad into the seventh/ninth chord the scale itself implies:
 * V becomes a dominant seventh, ii a minor seventh, vii half-diminished, and so
 * on. The church modes never produce mMaj7 or fully diminished sevenths, so the
 * minor and diminished branches are fixed.
 */
function extendedQuality(
  triad: ChordQuality,
  seventh: number,
  extension: ChordExtension,
): ChordQuality {
  if (extension === "triad") return triad;
  const seventhQuality: SeventhQuality =
    triad === "major"
      ? seventh === 11
        ? "major7"
        : "dominant7"
      : triad === "minor"
        ? "minor7"
        : "halfDiminished7";
  return extension === "seventh" ? seventhQuality : NINTH_OF_SEVENTH[seventhQuality];
}

function romanNumeral(quality: ChordQuality, index: number) {
  const base = ROMAN[index];
  const lower = base.toLowerCase();
  switch (quality) {
    case "major":
    case "major7":
    case "major9":
    case "dominant7":
    case "dominant9":
      return base;
    case "minor":
    case "minor7":
    case "minor9":
      return lower;
    case "diminished":
    case "diminished7":
      return `${lower}°`;
    case "halfDiminished7":
    case "halfDiminished9":
      return `${lower}ø`;
  }
}

const keyCache = new Map<string, KeyScale>();

/** Key scale + the seven diatonic chords, memoised per (tonic, mode, extension). */
export function keyScale(
  tonicPc: number,
  modeId: ModeId,
  extension: ChordExtension = "triad",
): KeyScale {
  const pc = ((tonicPc % 12) + 12) % 12;
  const mode = modeById(modeId);
  const cacheKey = `${pc}:${mode.id}:${extension}`;
  const cached = keyCache.get(cacheKey);
  if (cached) return cached;

  const letter = tonicLetter(pc, mode);
  const degrees: ScaleDegree[] = mode.intervals.map((interval, index) => {
    const degreePc = (pc + interval) % 12;
    const name = spellPitch(degreePc, (letter + index) % 7);
    const quality = extendedQuality(mode.qualities[index], seventhInterval(mode, index), extension);
    const numeral = extension === "seventh" ? "7" : extension === "ninth" ? "9" : "";
    return {
      pc: degreePc,
      name,
      quality,
      chord: `${name}${QUALITY_SUFFIX[quality]}`,
      roman: `${romanNumeral(quality, index)}${numeral}`,
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
export function keyChords(
  tonicPc: number,
  modeId: ModeId,
  extension: ChordExtension = "triad",
): ChordId[] {
  return keyScale(tonicPc, modeId, extension).chords;
}

export function keyLabel(tonicPc: number, modeId: ModeId, extension: ChordExtension = "triad") {
  return keyScale(tonicPc, modeId, extension).label;
}

/* ------------------------------------------------------------------ */
/* Voicings                                                            */
/* ------------------------------------------------------------------ */

const QUALITY_INTERVALS: Record<ChordQuality, readonly number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  major7: [0, 4, 7, 11],
  minor7: [0, 3, 7, 10],
  dominant7: [0, 4, 7, 10],
  halfDiminished7: [0, 3, 6, 10],
  diminished7: [0, 3, 6, 9],
  major9: [0, 4, 7, 11, 14],
  minor9: [0, 3, 7, 10, 14],
  dominant9: [0, 4, 7, 10, 14],
  halfDiminished9: [0, 3, 6, 10, 14],
};

const QUALITY_SUFFIX: Record<ChordQuality, string> = {
  major: "",
  minor: "m",
  diminished: "dim",
  major7: "maj7",
  minor7: "m7",
  dominant7: "7",
  halfDiminished7: "m7♭5",
  diminished7: "dim7",
  major9: "maj9",
  minor9: "m9",
  dominant9: "9",
  halfDiminished9: "m9♭5",
};

/** Label for a bare root + quality pair, spelled with the flat note names guitarists read. */
export function chordLabel(pc: number, quality: ChordQuality) {
  return `${pitchName(pc)}${QUALITY_SUFFIX[quality]}`;
}

const QUALITY_LABEL: Record<ChordQuality, string> = {
  major: "大三和弦",
  minor: "小三和弦",
  diminished: "减三和弦",
  major7: "大七和弦",
  minor7: "小七和弦",
  dominant7: "属七和弦",
  halfDiminished7: "半减七和弦",
  diminished7: "减七和弦",
  major9: "大九和弦",
  minor9: "小九和弦",
  dominant9: "属九和弦",
  halfDiminished9: "半减九和弦",
};

/**
 * Scale-step offset (0 = root letter) for each chord interval: third, fifth,
 * seventh and ninth each get their own letter, so B♭7 spells D♭ F A♭.
 */
const TONE_STEPS: Record<number, number> = {
  0: 0,
  3: 2,
  4: 2,
  6: 4,
  7: 4,
  8: 4,
  9: 6,
  10: 6,
  11: 6,
  14: 8,
};

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

/**
 * Qualities without a hand-written CAGED shape. Their extra tones (seventh,
 * ninth) make fixed shapes cramped, so a small search picks a compact voicing
 * with the root in the bass instead.
 */
const SEARCHED_QUALITIES = new Set<ChordQuality>([
  "major7",
  "minor7",
  "dominant7",
  "halfDiminished7",
  "diminished7",
  "major9",
  "minor9",
  "dominant9",
  "halfDiminished9",
]);

const SEARCH_MAX_FRET = 12;
/** Shapes wider than this are awkward to hold and get penalised. */
const SEARCH_MAX_SPAN = 5;

type VoicingOption = { fret: number; tone: number };

/** Per string, every fret (0…12) that sounds a chord tone, plus muted (-1). */
function voicingOptions(pc: number, quality: ChordQuality): VoicingOption[][] {
  const tonePcs = QUALITY_INTERVALS[quality].map((interval) => (pc + interval) % 12);
  return TUNING_MIDI.map((openMidi) => {
    const openPc = openMidi % 12;
    const options: VoicingOption[] = [{ fret: -1, tone: -1 }];
    for (let fret = 0; fret <= SEARCH_MAX_FRET; fret++) {
      const tone = tonePcs.indexOf((openPc + fret) % 12);
      if (tone >= 0) options.push({ fret, tone });
    }
    return options;
  });
}

/**
 * Exhaustive six-string search for a compact voicing that sounds every chord
 * tone, prefers the root in the bass, and keeps the frets under the hand.
 * At most ~6⁶ combinations per chord, so it runs fine on the first strum.
 */
function searchVoicing(pc: number, quality: ChordQuality): number[] {
  const options = voicingOptions(pc, quality);
  const frets: number[] = new Array(6).fill(-1);
  let best: number[] = frets.slice();
  let bestScore = Number.NEGATIVE_INFINITY;

  const visit = (
    string: number,
    mask: number,
    bassTone: number,
    lowest: number,
    highest: number,
    muted: number,
    open: number,
  ) => {
    if (string === 6) {
      if (bassTone < 0) return;
      let coverage = 0;
      for (let bits = mask; bits; bits >>= 1) coverage += bits & 1;
      const span = highest - lowest;
      const score =
        coverage * 12 +
        (bassTone === 0 ? 8 : 0) -
        highest * 0.5 -
        span * 0.8 -
        Math.max(0, span - SEARCH_MAX_SPAN) * 20 -
        muted * 1.2 +
        open * 0.3;
      if (score > bestScore) {
        bestScore = score;
        best = frets.slice();
      }
      return;
    }

    for (const option of options[string]) {
      const isMuted = option.fret < 0;
      frets[string] = option.fret;
      visit(
        string + 1,
        isMuted ? mask : mask | (1 << option.tone),
        bassTone < 0 && !isMuted ? option.tone : bassTone,
        isMuted ? lowest : lowest < 0 ? option.fret : Math.min(lowest, option.fret),
        isMuted ? highest : Math.max(highest, option.fret),
        muted + (isMuted ? 1 : 0),
        open + (option.fret === 0 ? 1 : 0),
      );
    }
  };

  visit(0, 0, -1, -1, -1, 0, 0);
  return best;
}

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

  if (SEARCHED_QUALITIES.has(quality)) {
    const searched = searchVoicing(pc, quality);
    voicingCache.set(cacheKey, searched);
    return searched;
  }

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
  const notes = QUALITY_INTERVALS[quality].map((interval, index) =>
    spellPitch(tonePcs[index], (letter + (TONE_STEPS[interval] ?? index * 2)) % 7),
  );

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

const CHORD_LABEL_RE = /^([A-G])([♯♭]{0,2})(.*)$/;

const SUFFIX_QUALITY: Record<string, ChordQuality> = {
  "": "major",
  m: "minor",
  dim: "diminished",
  maj7: "major7",
  m7: "minor7",
  "7": "dominant7",
  "m7♭5": "halfDiminished7",
  dim7: "diminished7",
  maj9: "major9",
  m9: "minor9",
  "9": "dominant9",
  "m9♭5": "halfDiminished9",
};

function parseChordLabel(label: string) {
  const match = CHORD_LABEL_RE.exec(label.trim());
  if (!match) return null;
  const letter = LETTERS.indexOf(match[1] as (typeof LETTERS)[number]);
  if (letter < 0) return null;
  const accidental = ACCIDENTAL_VALUE[match[2] ?? ""];
  if (accidental === undefined) return null;
  const pc = (((LETTER_PCS[letter] + accidental) % 12) + 12) % 12;
  const quality = SUFFIX_QUALITY[match[3] ?? ""];
  if (!quality) return null;
  return { letter, pc, quality };
}

/** True when a label denotes the given root + quality, without building a voicing. */
export function chordMatches(label: ChordId, pc: number, quality: ChordQuality) {
  const parsed = parseChordLabel(label);
  return Boolean(parsed) && parsed?.pc === pc && parsed?.quality === quality;
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
