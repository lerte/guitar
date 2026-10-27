/**
 * Per-gesture chord assignments.
 *
 * By default every left-hand shape selects a *scale degree*, so the chord moves
 * with the key. A shape can instead be pinned to a single chord (it then plays
 * the same chord in every key), or left blank so that it does nothing at all —
 * useful when a shape keeps misfiring, or when only a few chords are needed.
 *
 * Only overrides are stored: a pattern that is missing from the map keeps
 * following the key's degrees, which is also what "恢复默认" restores.
 */
import {
  chordLabel,
  getChord,
  GESTURE_SLOTS,
  type ChordId,
  type ChordQuality,
} from "./chords";

/** Stored overrides keyed by finger pattern ("01000" …). `null` = 留空. */
export type GestureMap = Record<string, ChordId | null>;

export const EMPTY_GESTURE_MAP: GestureMap = {};

/** What a recognised shape does. */
export type GestureBinding =
  | { kind: "degree"; degree: number }
  | { kind: "chord"; chord: ChordId }
  /** 切音: the default behaviour of the fist. */
  | { kind: "mute" }
  /** 留空: the shape is ignored and the current chord keeps sounding. */
  | { kind: "none" };

const SLOT_PATTERNS = new Set<string>(GESTURE_SLOTS.map((slot) => slot.pattern));

/**
 * Resolve a finger pattern to its behaviour. `degree` is what the shape would
 * select in the current key (null = 切音), used whenever no override is stored.
 */
export function bindingFor(
  gestures: GestureMap | undefined,
  pattern: string,
  degree: number | null,
): GestureBinding {
  if (gestures && pattern in gestures) {
    const value = gestures[pattern];
    if (value === null) return { kind: "none" };
    if (getChord(value)) return { kind: "chord", chord: value };
  }
  return degree === null ? { kind: "mute" } : { kind: "degree", degree };
}

/** Stable identity, so the controller can compare bindings cheaply. */
export function bindingKey(binding: GestureBinding): string {
  switch (binding.kind) {
    case "degree":
      return `degree:${binding.degree}`;
    case "chord":
      return `chord:${binding.chord}`;
    default:
      return binding.kind;
  }
}

export function sameBinding(a: GestureBinding, b: GestureBinding) {
  return bindingKey(a) === bindingKey(b);
}

export type ChordOption = { id: ChordId; pc: number; quality: ChordQuality };

const ROOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

function optionsFor(quality: ChordQuality): ChordOption[] {
  return ROOTS.map((pc) => ({ id: chordLabel(pc, quality), pc, quality }));
}

/** 12 roots × every quality the voicing engine can build. */
export const CHORD_GROUPS: { quality: ChordQuality; label: string; chords: ChordOption[] }[] = [
  { quality: "major", label: "大三和弦", chords: optionsFor("major") },
  { quality: "minor", label: "小三和弦", chords: optionsFor("minor") },
  { quality: "diminished", label: "减三和弦", chords: optionsFor("diminished") },
  { quality: "major7", label: "大七和弦", chords: optionsFor("major7") },
  { quality: "minor7", label: "小七和弦", chords: optionsFor("minor7") },
  { quality: "dominant7", label: "属七和弦", chords: optionsFor("dominant7") },
  { quality: "halfDiminished7", label: "半减七和弦", chords: optionsFor("halfDiminished7") },
  { quality: "diminished7", label: "减七和弦", chords: optionsFor("diminished7") },
  { quality: "major9", label: "大九和弦", chords: optionsFor("major9") },
  { quality: "minor9", label: "小九和弦", chords: optionsFor("minor9") },
  { quality: "dominant9", label: "属九和弦", chords: optionsFor("dominant9") },
  { quality: "halfDiminished9", label: "半减九和弦", chords: optionsFor("halfDiminished9") },
];

export const GESTURE_MAP_STORAGE_KEY = "air-guitar:gestures";

/** Assign a chord, `null` for 留空, or `undefined` to follow the key again. */
export function assignGesture(
  gestures: GestureMap,
  pattern: string,
  value: ChordId | null | undefined,
): GestureMap {
  if (value === undefined) {
    if (!(pattern in gestures)) return gestures;
    const next = { ...gestures };
    delete next[pattern];
    return next;
  }
  if (pattern in gestures && gestures[pattern] === value) return gestures;
  return { ...gestures, [pattern]: value };
}

export function gestureOverrideCount(gestures: GestureMap) {
  return Object.keys(gestures).filter((pattern) => SLOT_PATTERNS.has(pattern)).length;
}

/** Read the stored overrides, dropping anything that no longer makes sense. */
export function loadGestureMap(): GestureMap {
  try {
    const raw = window.localStorage.getItem(GESTURE_MAP_STORAGE_KEY);
    if (!raw) return EMPTY_GESTURE_MAP;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return EMPTY_GESTURE_MAP;
    const source = parsed as Record<string, unknown>;
    const map: GestureMap = {};
    for (const slot of GESTURE_SLOTS) {
      if (!(slot.pattern in source)) continue;
      const value = source[slot.pattern];
      if (value === null) map[slot.pattern] = null;
      else if (typeof value === "string" && getChord(value)) map[slot.pattern] = value;
    }
    return map;
  } catch {
    return EMPTY_GESTURE_MAP;
  }
}

export function saveGestureMap(gestures: GestureMap) {
  try {
    window.localStorage.setItem(GESTURE_MAP_STORAGE_KEY, JSON.stringify(gestures));
  } catch {
    /* private mode / storage disabled: the mapping simply is not persisted */
  }
}
