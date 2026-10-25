import {
  countExtended,
  patternKey,
  type FingerKey,
  type FingerPattern,
} from "@/lib/guitar/chords";

export type Landmark = { x: number; y: number; z: number };
export type Vec2 = { x: number; y: number };

/** MediaPipe hand topology: 21 landmarks, 0 = wrist. */
export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
];

export const FINGER_JOINTS: Record<FingerKey, readonly number[]> = {
  thumb: [1, 2, 3, 4],
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
};

export const FINGERTIPS = [4, 8, 12, 16, 20] as const;

const WRIST = 0;
const MIDDLE_MCP = 9;
const INDEX_MCP = 5;

export const clamp = (value: number, min = 0, max = 1) =>
  value < min ? min : value > max ? max : value;

export function distance(a: Vec2, b: Vec2) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pathLength(points: readonly Vec2[]) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1], points[i]);
  return total;
}

/** 1 = perfectly straight finger, ~0.5 = fully curled. */
function straightness(points: readonly Vec2[]) {
  const path = pathLength(points);
  if (path <= 1e-6) return 0;
  return distance(points[0], points[points.length - 1]) / path;
}

export type HandAnalysis = {
  /** Palm centroid in normalised image coordinates. */
  palm: Vec2;
  /** Wrist -> middle MCP distance, the unit for all relative measures. */
  scale: number;
  fingers: FingerPattern;
  pattern: string;
  extendedCount: number;
  /** 1 = closed fist, 0 = wide open. */
  grabScore: number;
  grab: boolean;
  /** Mean fingertip-to-palm distance / scale (openness). */
  span: number;
  /** Mean fingertip spread / scale. */
  spread: number;
  /** Thumb-tip to index-tip distance / scale; small means pinched. */
  pinch: number;
};

/**
 * Turn raw landmarks into gesture features.
 *
 * All measurements are normalised by the wrist-to-middle-MCP distance, so they
 * survive hands being near/far from the camera, rotated, or foreshortened.
 */
export function analyzeHand(landmarks: readonly Landmark[]): HandAnalysis {
  const wrist = landmarks[WRIST];
  const middleMcp = landmarks[MIDDLE_MCP];
  const indexMcp = landmarks[INDEX_MCP];

  const palm: Vec2 = {
    x: (landmarks[0].x + landmarks[5].x + landmarks[9].x + landmarks[13].x + landmarks[17].x) / 5,
    y: (landmarks[0].y + landmarks[5].y + landmarks[9].y + landmarks[13].y + landmarks[17].y) / 5,
  };

  const scale = Math.max(1e-5, distance(wrist, middleMcp));

  const fingers = {} as FingerPattern;
  const tipDistances: number[] = [];
  const curls: number[] = [];

  (Object.keys(FINGER_JOINTS) as FingerKey[]).forEach((finger) => {
    const joints = FINGER_JOINTS[finger];
    const chain = joints.map((index) => landmarks[index]);
    const tip = chain[chain.length - 1];
    const extended = isFingerExtended(landmarks, finger, scale, indexMcp);
    fingers[finger] = extended;
    if (finger !== "thumb") {
      tipDistances.push(distance(tip, palm) / scale);
      curls.push(straightness(chain));
    }
  });

  const pattern = patternKey(fingers);
  const extendedCount = countExtended(fingers);
  const mean = (values: number[]) =>
    values.reduce((total, value) => total + value, 0) / Math.max(1, values.length);
  const span = mean(tipDistances);

  // A grab = fingertips pulled into the palm AND fingers folded. Either signal
  // alone is ambiguous (pointing has a low span, a relaxed hand is curled), and
  // a raised finger must never read as a grab or chord gestures would strum.
  const closed = clamp((1.15 - span) / 0.3);
  const curled = clamp((0.9 - mean(curls)) / 0.35);
  const folded = !fingers.index && !fingers.middle && !fingers.ring && !fingers.pinky;
  const rawGrab = clamp(closed * 0.55 + curled * 0.45);
  const grabScore = folded ? rawGrab : Math.min(rawGrab, 0.3);

  const tips = FINGERTIPS.map((index) => landmarks[index]);
  let spreadTotal = 0;
  let pairs = 0;
  for (let i = 0; i < tips.length; i++) {
    for (let j = i + 1; j < tips.length; j++) {
      spreadTotal += distance(tips[i], tips[j]) / scale;
      pairs += 1;
    }
  }

  return {
    palm,
    scale,
    fingers,
    pattern,
    extendedCount,
    grabScore,
    grab: grabScore > 0.58,
    span,
    spread: pairs > 0 ? spreadTotal / pairs : 0,
    pinch: distance(landmarks[4], landmarks[8]) / scale,
  };
}

function isFingerExtended(
  landmarks: readonly Landmark[],
  finger: FingerKey,
  scale: number,
  indexMcp: Landmark,
) {
  const joints = FINGER_JOINTS[finger];
  const chain = joints.map((index) => landmarks[index]);

  if (finger === "thumb") {
    // Thumb lives on its own plane: straightness plus abduction away from the
    // index knuckle, which is what separates a tucked thumb from a raised one.
    const straight = straightness(chain.slice(1));
    const abduction = distance(chain[3], indexMcp) / scale;
    return straight > 0.74 && abduction > 0.62;
  }

  const straight = straightness(chain);
  const wrist = landmarks[WRIST];
  const tipReach = distance(wrist, chain[3]) > distance(wrist, chain[1]) * 1.06;
  return straight > 0.85 && tipReach;
}
