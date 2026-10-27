import type { StrumDirection } from "@/lib/guitar/audio-engine";
import { getChord, STRING_LABELS, type ChordId } from "@/lib/guitar/chords";
import { STRING_BAND, type PlayMode } from "./gesture-controller";
import { FINGERTIPS, HAND_CONNECTIONS, type Landmark } from "./landmarks";

export type OverlayHand = {
  landmarks: Landmark[];
  role: "chord" | "strum";
  grabbing: boolean;
  /** Timestamp of the last chord change, for the confirmation ring. */
  flashAt?: number;
};

export type StrumPulse = {
  direction: StrumDirection;
  at: number;
  velocity: number;
};

export type PluckPulse = {
  stringIndex: number;
  at: number;
};

export type OverlayInput = {
  hands: OverlayHand[];
  strum: StrumPulse | null;
  now: number;
  mirror: boolean;
  showSkeleton: boolean;
  mode?: PlayMode;
  /** Engine string index under the right hand (pick mode). */
  targetString?: number | null;
  pluck?: PluckPulse | null;
  /** Current chord, used to dim strings the shape does not play. */
  chord?: ChordId | null;
};

type Palette = {
  line: string;
  soft: string;
  glow: string;
  text: string;
};

const CHORD_PALETTE: Palette = {
  line: "#63e9e1",
  soft: "rgba(99, 233, 225, 0.22)",
  glow: "rgba(99, 233, 225, 0.85)",
  text: "#a9fffa",
};

const STRUM_PALETTE: Palette = {
  line: "#ffca7a",
  soft: "rgba(255, 202, 122, 0.2)",
  glow: "rgba(255, 202, 122, 0.85)",
  text: "#ffe1ad",
};

const FONT_STACK =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

/**
 * Draws the hand skeleton, palm indicators, labels and strum feedback on top of
 * the mirrored camera feed. Pure canvas, no React re-renders involved.
 */
export function drawStage(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement | null,
  input: OverlayInput,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width < 2 || height < 2) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  // Mirrors `object-fit: cover`, so landmarks stay glued to the video content.
  const videoWidth = video?.videoWidth ?? 0;
  const videoHeight = video?.videoHeight ?? 0;
  let boxX = 0;
  let boxY = 0;
  let boxW = width;
  let boxH = height;
  if (videoWidth > 0 && videoHeight > 0) {
    const scale = Math.max(width / videoWidth, height / videoHeight);
    boxW = videoWidth * scale;
    boxH = videoHeight * scale;
    boxX = (width - boxW) / 2;
    boxY = (height - boxH) / 2;
  }

  const project = (point: Landmark) => ({
    x: boxX + (input.mirror ? 1 - point.x : point.x) * boxW,
    y: boxY + point.y * boxH,
  });

  for (const hand of input.hands) {
    const palette = hand.role === "chord" ? CHORD_PALETTE : STRUM_PALETTE;
    const points = hand.landmarks.map(project);
    const wrist = points[0];
    const middleKnuckle = points[9];
    const palmX = (points[0].x + points[5].x + points[9].x + points[13].x + points[17].x) / 5;
    const palmY = (points[0].y + points[5].y + points[9].y + points[13].y + points[17].y) / 5;
    const handScale = Math.max(
      18,
      Math.hypot(wrist.x - middleKnuckle.x, wrist.y - middleKnuckle.y) * 1.35,
    );

    if (hand.flashAt) {
      const age = input.now - hand.flashAt;
      if (age >= 0 && age < 520) {
        const progress = age / 520;
        ctx.beginPath();
        ctx.arc(palmX, palmY, handScale * (0.7 + progress * 0.8), 0, Math.PI * 2);
        ctx.strokeStyle = palette.line;
        ctx.globalAlpha = (1 - progress) * 0.5;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    if (input.showSkeleton) {
      // Glow pass then crisp pass: cheap "neon" without a filter.
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.beginPath();
      for (const [from, to] of HAND_CONNECTIONS) {
        ctx.moveTo(points[from].x, points[from].y);
        ctx.lineTo(points[to].x, points[to].y);
      }
      ctx.strokeStyle = palette.soft;
      ctx.lineWidth = 12;
      ctx.shadowColor = palette.glow;
      ctx.shadowBlur = 18;
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.beginPath();
      for (const [from, to] of HAND_CONNECTIONS) {
        ctx.moveTo(points[from].x, points[from].y);
        ctx.lineTo(points[to].x, points[to].y);
      }
      ctx.strokeStyle = palette.line;
      ctx.lineWidth = 2.4;
      ctx.stroke();

      points.forEach((point, index) => {
        const isTip = (FINGERTIPS as readonly number[]).includes(index);
        const radius = isTip ? 4.2 : index === 0 ? 3.6 : 2.4;
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = isTip ? palette.line : "rgba(255,255,255,0.92)";
        ctx.fill();
        ctx.strokeStyle = "rgba(4, 8, 14, 0.55)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      });
    }

    // Palm ring: dashed normally, filled while the hand is grabbing.
    ctx.beginPath();
    ctx.arc(palmX, palmY, handScale * 0.62, 0, Math.PI * 2);
    ctx.setLineDash(hand.grabbing ? [] : [2, 7]);
    ctx.lineWidth = hand.grabbing ? 2 : 1.2;
    ctx.strokeStyle = hand.grabbing ? palette.line : "rgba(255,255,255,0.35)";
    ctx.stroke();
    ctx.setLineDash([]);

    if (hand.grabbing) {
      ctx.beginPath();
      ctx.arc(palmX, palmY, handScale * 0.62, 0, Math.PI * 2);
      ctx.fillStyle = palette.soft;
      ctx.fill();
    }


  }

  if (input.mode === "pick") {
    drawStringRail(
      ctx,
      width,
      height,
      input.targetString ?? null,
      input.pluck ?? null,
      input.now,
      input.chord ?? null,
    );
  } else if (input.strum) {
    const age = input.now - input.strum.at;
    if (age >= 0 && age < 360) {
      const strumHand = input.hands.find((hand) => hand.role === "strum");
      let anchorX = width * 0.78;
      let anchorY = height * 0.5;
      if (strumHand) {
        const points = strumHand.landmarks.map(project);
        anchorX = (points[0].x + points[9].x) / 2;
        anchorY = (points[0].y + points[9].y) / 2;
      }
      drawStrumBurst(ctx, anchorX, anchorY, input.strum.direction, age / 360, input.strum.velocity);
    }
  }
}

/**
 * 分解和弦 overlay: six faint lanes across the frame (the same band the gesture
 * layer maps the right hand onto), with the hovered string lit and a flash on
 * every pluck. Drawing the lanes where the hand actually is makes aiming easy.
 */
function drawStringRail(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  target: number | null,
  pluck: PluckPulse | null,
  now: number,
  chord: ChordId | null,
) {
  const top = height * STRING_BAND.top;
  const bandHeight = (height * (STRING_BAND.bottom - STRING_BAND.top)) / 6;

  ctx.save();
  ctx.textBaseline = "alphabetic";

  for (let band = 0; band < 6; band++) {
    const index = 5 - band; // top of the frame = high e
    const bandTop = top + band * bandHeight;
    const centerY = bandTop + bandHeight / 2;
    const active = target === index;
    const playable = !chord || (getChord(chord)?.frets[index] ?? -1) >= 0;
    const label = `${6 - index} · ${STRING_LABELS[index]}${playable ? "" : " ×"}`;

    if (active) {
      ctx.fillStyle = "rgba(99, 233, 225, 0.09)";
      ctx.fillRect(0, bandTop, width, bandHeight);
      ctx.strokeStyle = "rgba(99, 233, 225, 0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, bandTop);
      ctx.lineTo(width, bandTop);
      ctx.moveTo(0, bandTop + bandHeight);
      ctx.lineTo(width, bandTop + bandHeight);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.strokeStyle = active
      ? playable
        ? "rgba(99, 233, 225, 0.85)"
        : "rgba(255,255,255,0.4)"
      : playable
        ? "rgba(255,255,255,0.16)"
        : "rgba(255,255,255,0.07)";
    ctx.lineWidth = active ? 2 : 1;
    ctx.stroke();

    // The left readout panel owns the edge, so the lane labels sit just right
    // of it — the lines still run full width behind the panel.
    const labelX = 198;
    ctx.font = `${active ? 600 : 500} ${active ? 12 : 10}px ${FONT_STACK}`;
    if (active) {
      const textWidth = ctx.measureText(label).width;
      roundRect(ctx, labelX - 8, centerY - 27, textWidth + 16, 21, 7);
      ctx.fillStyle = "rgba(7, 11, 20, 0.72)";
      ctx.fill();
      ctx.strokeStyle = "rgba(99, 233, 225, 0.45)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.fillStyle = active
      ? playable
        ? "#a9fffa"
        : "rgba(255,255,255,0.6)"
      : playable
        ? "rgba(255,255,255,0.42)"
        : "rgba(255,255,255,0.16)";
    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = 8;
    ctx.fillText(label, labelX, centerY - 8);
    ctx.shadowBlur = 0;
  }

  if (pluck && target !== null) {
    const age = now - pluck.at;
    if (age >= 0 && age < 340) {
      const progress = age / 340;
      const band = 5 - target;
      const centerY = top + band * bandHeight + bandHeight / 2;
      ctx.globalAlpha = (1 - progress) * 0.9;
      ctx.strokeStyle = "#ffca7a";
      ctx.lineWidth = 2 + (1 - progress) * 3;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(width, centerY);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  ctx.restore();
}

function drawStrumBurst(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  direction: StrumDirection,
  progress: number,
  velocity: number,
) {
  const alpha = Math.max(0, 1 - progress) ** 1.4;
  const travel = 54 * progress;
  const sign = direction === "down" ? 1 : -1;
  const spread = 34 + velocity * 18;

  ctx.save();
  ctx.translate(x, y + sign * travel);
  ctx.strokeStyle = STRUM_PALETTE.line;
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    const offset = (i - 1) * 13 + sign * 10;
    ctx.globalAlpha = alpha * (0.85 - Math.abs(i - 1) * 0.2);
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-spread / 2 + Math.abs(i - 1) * 8, offset);
    ctx.lineTo(spread / 2 - Math.abs(i - 1) * 8, offset);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
