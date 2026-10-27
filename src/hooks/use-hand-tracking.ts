import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { ChordId } from "@/lib/guitar/chords";
import type { GestureMap } from "@/lib/guitar/gesture-map";
import type { StrumDirection } from "@/lib/guitar/audio-engine";
import { getHandTracker, onTrackerStage, type HandTracker, type RawHand } from "@/lib/hands/hand-tracker";
import {
  GestureController,
  type GestureState,
  type PlayMode,
  type PluckEvent,
  type TrackedHand,
} from "@/lib/hands/gesture-controller";
import type { FeelTuning } from "@/lib/hands/feel";
import { analyzeHand } from "@/lib/hands/landmarks";
import { drawStage, type OverlayHand } from "@/lib/hands/overlay";

export type TrackingStatus = "idle" | "loading" | "running" | "error";

export type HandSummary = {
  fingers: number;
  pattern: string;
  grabScore: number;
  span: number;
  x: number;
  y: number;
};

export type StrumSummary = {
  direction: StrumDirection;
  velocity: number;
  at: number;
};

export type TrackingSnapshot = {
  chord: ChordId | null;
  fingers: number;
  pattern: string;
  left: HandSummary | null;
  right: HandSummary | null;
  grabbing: boolean;
  grabScore: number;
  lastStrum: StrumSummary | null;
  handCount: number;
  fps: number;
  mode: PlayMode;
  /** Engine string index under the right hand in pick mode. */
  targetString: number | null;
  engaging: boolean;
  lastPluck: PluckEvent | null;
};

const EMPTY_SNAPSHOT: TrackingSnapshot = {
  chord: "C",
  fingers: 0,
  pattern: "01000",
  left: null,
  right: null,
  grabbing: false,
  grabScore: 0,
  lastStrum: null,
  handCount: 0,
  fps: 0,
  mode: "strum",
  targetString: null,
  engaging: false,
  lastPluck: null,
};

type Options = {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  active: boolean;
  swapHands: boolean;
  showSkeleton: boolean;
  mode: PlayMode;
  feel: FeelTuning;
  /** The seven chords of the current key + mode, in scale-degree order. */
  chords: ChordId[];
  /** User overrides: shape → fixed chord / 留空. */
  gestures: GestureMap;
  onChord?: (chord: ChordId | null, info: { fingers: number; pattern: string }) => void;
  onStrum?: (event: { direction: StrumDirection; velocity: number }) => void;
  onPluck?: (event: PluckEvent) => void;
};

function toTrackedHand(hand: RawHand, swap: boolean): TrackedHand {
  const handedness = swap
    ? hand.handedness === "Right"
      ? "Left"
      : "Right"
    : hand.handedness;
  return {
    handedness,
    score: hand.score,
    landmarks: hand.landmarks,
    analysis: analyzeHand(hand.landmarks),
  };
}

function summarize(hand: TrackedHand | null): HandSummary | null {
  if (!hand) return null;
  return {
    fingers: hand.analysis.extendedCount,
    pattern: hand.analysis.pattern,
    grabScore: hand.analysis.grabScore,
    span: hand.analysis.span,
    x: hand.analysis.palm.x,
    y: hand.analysis.palm.y,
  };
}

function toOverlayHands(state: GestureState): OverlayHand[] {
  const hands: OverlayHand[] = [];

  if (state.left) {
    hands.push({
      landmarks: state.left.landmarks,
      role: "chord",
      grabbing: false,
      flashAt: state.chordChangedAt || undefined,
    });
  }

  if (state.right) {
    const picking = state.mode === "pick";
    hands.push({
      landmarks: state.right.landmarks,
      role: "strum",
      grabbing: picking ? state.engaging : state.grabbing,
    });
  }

  return hands;
}

/**
 * Owns the camera-frame loop: MediaPipe inference -> gesture controller ->
 * audio callbacks + canvas overlay. React state is throttled so the HUD does
 * not re-render 60 times per second.
 */
export function useHandTracking(options: Options) {
  const { videoRef, canvasRef, active, swapHands, showSkeleton, onChord, onStrum, onPluck } = options;
  const [status, setStatus] = useState<TrackingStatus>("idle");
  const [stage, setStage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<TrackingSnapshot>(EMPTY_SNAPSHOT);
  const [attempt, setAttempt] = useState(0);

  const optionsRef = useRef({
    onChord,
    onStrum,
    onPluck,
    swapHands,
    showSkeleton,
    mode: options.mode,
    feel: options.feel,
    chords: options.chords,
    gestures: options.gestures,
  });
  optionsRef.current = {
    onChord,
    onStrum,
    onPluck,
    swapHands,
    showSkeleton,
    mode: options.mode,
    feel: options.feel,
    chords: options.chords,
    gestures: options.gestures,
  };

  const retry = useCallback(() => {
    setError(null);
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!active) {
      setStatus("idle");
      setStage("");
      return;
    }

    let cancelled = false;
    let raf = 0;
    let tracker: HandTracker | null = null;
    let controller: GestureController | null = null;
    let state: GestureState | null = null;
    let fps = 0;
    let lastTime = 0;
    let lastVideoTime = -1;
    let lastUi = 0;

    setStatus("loading");
    setError(null);
    setStage("初始化推理引擎");

    const unsubscribe = onTrackerStage((_nextStage, detail) => {
      if (cancelled) return;
      if (detail) setStage(detail);
    });

    const loop = () => {
      if (cancelled) return;
      raf = requestAnimationFrame(loop);

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const activeTracker = tracker;
      if (!video || !canvas || !controller || !activeTracker) return;

      const now = performance.now();
      const delta = lastTime ? Math.max(1, now - lastTime) : 16;
      lastTime = now;
      fps = fps ? fps * 0.9 + (1000 / delta) * 0.1 : 1000 / delta;

      const settings = optionsRef.current;
      controller.setMode(settings.mode);
      controller.setTuning(settings.feel);
      controller.setChords(settings.chords);
      controller.setGestureMap(settings.gestures);

      if (video.readyState >= 2 && video.videoWidth > 0 && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        let raw: RawHand[] = [];
        try {
          raw = activeTracker.detect(video);
        } catch {
          raw = [];
        }
        const hands = raw.map((hand) => toTrackedHand(hand, settings.swapHands));
        state = controller.update(hands, now);
      }

      drawStage(canvas, video, {
        hands: state ? toOverlayHands(state) : [],
        strum: state?.lastStrum ?? null,
        now,
        mirror: true,
        showSkeleton: settings.showSkeleton,
        mode: state?.mode ?? settings.mode,
        targetString: state?.targetString ?? null,
        pluck: state?.lastPluck ?? null,
        chord: state?.chord ?? null,
      });

      if (now - lastUi > 90 && state) {
        lastUi = now;
        setSnapshot({
          chord: state.chord,
          fingers: state.fingers,
          pattern: state.pattern,
          left: summarize(state.left),
          right: summarize(state.right),
          grabbing: state.grabbing,
          grabScore: state.grabScore,
          lastStrum: state.lastStrum,
          handCount: (state.left ? 1 : 0) + (state.right ? 1 : 0),
          fps: Math.round(fps),
          mode: state.mode,
          targetString: state.targetString,
          engaging: state.engaging,
          lastPluck: state.lastPluck,
        });
      }
    };

    getHandTracker()
      .then((created) => {
        if (cancelled) return;
        tracker = created;
        controller = new GestureController({
          onChord: (chord, info) => optionsRef.current.onChord?.(chord, info),
          onStrum: (event) => optionsRef.current.onStrum?.(event),
          onPluck: (event) => optionsRef.current.onPluck?.(event),
        });
        setStatus("running");
        setStage("");
        loop();
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        const message = cause instanceof Error ? cause.message : String(cause);
        setError(message);
        setStatus("error");
      });

    return () => {
      cancelled = true;
      unsubscribe();
      cancelAnimationFrame(raf);
    };
  }, [active, attempt, videoRef, canvasRef]);

  return { status, stage, error, snapshot, retry };
}
