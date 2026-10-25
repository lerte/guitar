import type { HandLandmarker } from "@mediapipe/tasks-vision";
import type { Landmark } from "./landmarks";

/**
 * Self-hosted assets, produced by `scripts/prepare-assets.mjs`.
 * BASE_URL keeps them reachable when the site is served from a sub-path
 * (GitHub Pages project pages: /<repo>/), and is "/" in local dev.
 */
const WASM_PATH = `${import.meta.env.BASE_URL}mediapipe/wasm`;
const LOCAL_MODEL = `${import.meta.env.BASE_URL}models/hand_landmarker.task`;
const CDN_MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export type TrackerStage = "wasm" | "model" | "ready";
export type TrackerStageListener = (stage: TrackerStage, detail?: string) => void;

export type RawHand = {
  /** Model label. The tracker does NOT correct for mirroring; the UI does. */
  handedness: "Left" | "Right";
  score: number;
  landmarks: Landmark[];
};

async function resolveModelPath() {
  try {
    const response = await fetch(LOCAL_MODEL, { method: "HEAD" });
    if (response.ok) return LOCAL_MODEL;
  } catch {
    /* fall through to CDN */
  }
  return CDN_MODEL;
}

/** Thin wrapper around MediaPipe's HandLandmarker with GPU -> CPU fallback. */
export class HandTracker {
  private landmarker: HandLandmarker;
  private lastTimestamp = 0;
  delegate: "GPU" | "CPU";

  private constructor(landmarker: HandLandmarker, delegate: "GPU" | "CPU") {
    this.landmarker = landmarker;
    this.delegate = delegate;
  }

  static async create(onStage?: TrackerStageListener): Promise<HandTracker> {
    onStage?.("wasm", "初始化推理引擎");
    // Loaded on demand: the vision runtime is ~1.5 MB of JS the start screen
    // never needs, so it must not sit in the first-paint bundle.
    const { FilesetResolver, HandLandmarker: HandLandmarkerTask } = await import(
      "@mediapipe/tasks-vision"
    );
    const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
    const modelPath = await resolveModelPath();

    let landmarker: HandLandmarker | null = null;
    let delegate: "GPU" | "CPU" = "GPU";
    let lastError: unknown = null;

    for (const candidate of ["GPU", "CPU"] as const) {
      try {
        onStage?.("model", candidate === "GPU" ? "加载手部模型 · GPU" : "加载手部模型 · CPU");
        landmarker = await HandLandmarkerTask.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: modelPath, delegate: candidate },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.55,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        delegate = candidate;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!landmarker) {
      const detail = lastError instanceof Error ? lastError.message : "未知错误";
      throw new Error(`手部模型加载失败：${detail}`);
    }

    onStage?.("ready");
    return new HandTracker(landmarker, delegate);
  }

  /** Runs one inference on the current video frame. */
  detect(video: HTMLVideoElement): RawHand[] {
    const timestamp = performance.now();
    this.lastTimestamp = timestamp > this.lastTimestamp ? timestamp : this.lastTimestamp + 1;

    const result = this.landmarker.detectForVideo(video, this.lastTimestamp);
    const hands: RawHand[] = [];

    for (let i = 0; i < result.landmarks.length; i++) {
      const category = result.handedness[i]?.[0];
      const handedness = category?.categoryName === "Right" ? "Right" : "Left";
      hands.push({
        handedness,
        score: category?.score ?? 0,
        landmarks: result.landmarks[i].map((point) => ({
          x: point.x,
          y: point.y,
          z: point.z ?? 0,
        })),
      });
    }

    return hands;
  }

  close() {
    this.landmarker.close();
  }
}

/* ------------------------------------------------------------------ */
/* Module-level singleton: the model is ~8 MB, never reload it twice.  */
/* ------------------------------------------------------------------ */

let instance: HandTracker | null = null;
let loading: Promise<HandTracker> | null = null;
const stageListeners = new Set<TrackerStageListener>();

function emitStage(stage: TrackerStage, detail?: string) {
  for (const listener of stageListeners) listener(stage, detail);
}

export function onTrackerStage(listener: TrackerStageListener) {
  stageListeners.add(listener);
  return () => {
    stageListeners.delete(listener);
  };
}

export function getHandTracker(): Promise<HandTracker> {
  if (instance) return Promise.resolve(instance);
  if (!loading) {
    loading = HandTracker.create(emitStage)
      .then((tracker) => {
        instance = tracker;
        return tracker;
      })
      .catch((error: unknown) => {
        loading = null;
        throw error;
      });
  }
  return loading;
}
