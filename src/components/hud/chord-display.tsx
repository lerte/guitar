import { ArrowDown, ArrowUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PlayMode } from "@/lib/hands/gesture-controller";
import {
  getChord,
  STRING_LABELS,
  transposeChordLabel,
  transposedNotes,
  type Chord,
  type ChordId,
} from "@/lib/guitar/chords";
import { cn } from "@/lib/utils";

export type StrumPulse = {
  direction: "down" | "up";
  velocity: number;
  at: number;
  id: number;
};

export type PickPulse = {
  stringIndex: number;
  at: number;
  id: number;
};

type Props = {
  chord: ChordId | null;
  muted: boolean;
  fingers: number;
  grabbing: boolean;
  engaging?: boolean;
  hands: number;
  pulse: StrumPulse | null;
  playMode?: PlayMode;
  /** Engine string index under the right hand (pick mode). */
  targetString?: number | null;
  pluck?: PickPulse | null;
  /** 变调夹 position in frets (0 = off). */
  capo?: number;
  mode?: "camera" | "keyboard";
  /** Roman numeral of the current scale degree, e.g. "Ⅳ". */
  degree?: string | null;
  className?: string;
};

const STRUM_BUTTONS = [
  { direction: "down" as const, label: "下扫", Icon: ArrowDown },
  { direction: "up" as const, label: "上扫", Icon: ArrowUp },
];

export function ChordDisplay({
  chord,
  muted,
  fingers,
  grabbing,
  engaging = false,
  hands,
  pulse,
  playMode = "strum",
  targetString = null,
  pluck = null,
  capo = 0,
  mode = "camera",
  degree = null,
  className,
}: Props) {
  const def = chord ? getChord(chord) : null;
  const activeDirection = pulse?.direction;
  const picking = playMode === "pick";

  const statusText =
    mode === "keyboard"
      ? "键盘模式"
      : picking
        ? engaging
          ? "拨弦中"
          : "分解模式"
        : grabbing
          ? "握拳下扫"
          : hands > 0
            ? "展开上扫"
            : "无手部";

  return (
    <div
      className={cn(
        "hud-panel pointer-events-auto w-[min(348px,calc(100vw-2rem))] rounded-3xl p-4",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="hud-eyebrow flex items-center gap-1.5">
            当前和弦
            {degree && <span className="text-white/25">· {degree} 级</span>}
          </div>
          <div className="mt-1 flex items-end gap-2.5">
            <div
              className={cn(
                "chord-glyph text-[62px] font-semibold leading-[0.82] transition-colors duration-300",
                muted ? "text-white/25" : "text-white",
              )}
            >
              {muted ? "—" : (def?.id ?? "—")}
            </div>
            <div className="mb-1.5 flex flex-col items-start gap-1">
              <Badge variant={muted ? "warning" : def ? "default" : "outline"}>
                {muted ? "切音" : def ? def.qualityLabel : "待选择"}
              </Badge>
              {def && capo > 0 && (
                <Badge variant="warning">
                  变调夹 {capo} → {transposeChordLabel(def, capo)}
                </Badge>
              )}
              <span className="text-[10px] tracking-wide text-white/40">
                {def
                  ? capo > 0
                    ? `实际 ${transposedNotes(def, capo).join(" · ")}`
                    : def.notes.join(" · ")
                  : "举起左手"}
              </span>
            </div>
          </div>
        </div>
        {def ? <ChordDiagram chord={def} className="mt-0.5 shrink-0" /> : null}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
        <div className="flex items-center gap-2 text-[11px] text-white/45">
          <span className="hud-eyebrow">左手</span>
          <span className="tabular-nums text-white/70">
            {mode === "keyboard" ? "—" : muted ? "握拳" : `${fingers} 指`}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {picking ? (
            <PickBadge targetString={targetString} pluck={pluck} />
          ) : (
            STRUM_BUTTONS.map(({ direction, label, Icon }) => {
              const active = activeDirection === direction;
              return (
                <div
                  key={`${direction}-${pulse?.id ?? 0}`}
                  className={cn(
                    "relative flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] transition-colors duration-150",
                    active
                      ? "border-strum/60 bg-strum/15 text-strum"
                      : "border-white/10 bg-white/[0.02] text-white/35",
                  )}
                >
                  <Icon className="size-3" strokeWidth={2.4} />
                  {label}
                  {active && (
                    <span className="pointer-events-none absolute inset-0 animate-pulse-ring rounded-full border border-strum/50" />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-[10px] text-white/35">
        <span>
          {mode === "keyboard"
            ? "空格下扫 · ↑ 上扫"
            : picking
              ? hands > 0
                ? "右手高低选弦 · 捏合拨弦"
                : "举起右手选择弦"
              : hands > 0
                ? "握拳 = 下扫 · 展开 = 上扫"
                : "举起右手扫弦"}
        </span>
        <span
          className={cn(
            "transition-colors",
            (picking ? engaging : grabbing) ? "text-strum" : "text-white/25",
          )}
        >
          {statusText}
        </span>
      </div>
    </div>
  );
}

function PickBadge({
  targetString,
  pluck,
}: {
  targetString: number | null;
  pluck: PickPulse | null;
}) {
  const label =
    targetString !== null ? `${6 - targetString} · ${STRING_LABELS[targetString]}` : "—";
  return (
    <div className="relative flex items-center gap-1.5 rounded-full border border-strum/50 bg-strum/10 px-2.5 py-1 text-[10px] text-strum">
      <span className="size-1.5 rounded-full bg-strum" />
      拨弦 {label}
      {pluck && (
        <span
          key={pluck.id}
          className="pointer-events-none absolute inset-0 animate-pluck rounded-full border border-strum/70"
        />
      )}
    </div>
  );
}

/** Chord grid. Shapes that live up the neck are drawn from their hand position. */
function ChordDiagram({ chord, className }: { chord: Chord; className?: string }) {
  const shown = 4;
  const left = 8;
  const right = 72;
  const top = 16;
  const bottom = 84;
  const gapX = (right - left) / 5;
  const gapY = (bottom - top) / shown;
  const openPosition = chord.baseFret === 1;

  return (
    <svg
      className={cn("h-[96px] w-[80px] text-primary", className)}
      viewBox="0 0 80 92"
      fill="none"
      aria-hidden
    >
      {/* Nut (open position) or the top line of a shifted window. */}
      <rect
        x={left}
        y={top}
        width={right - left}
        height={openPosition ? 2.4 : 1}
        rx={openPosition ? 1.2 : 0}
        fill={openPosition ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.28)"}
      />
      {!openPosition && (
        <text x={1} y={top + gapY * 0.75} fontSize={7} fill="rgba(255,255,255,0.45)">
          {chord.baseFret}fr
        </text>
      )}
      {Array.from({ length: 6 }).map((_, index) => (
        <line
          key={`string-${index}`}
          x1={left + index * gapX}
          y1={top + 2.4}
          x2={left + index * gapX}
          y2={bottom}
          stroke="rgba(255,255,255,0.2)"
          strokeWidth={1}
        />
      ))}
      {Array.from({ length: shown }).map((_, index) => (
        <line
          key={`fret-${index}`}
          x1={left}
          y1={top + (index + 1) * gapY}
          x2={right}
          y2={top + (index + 1) * gapY}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={1}
        />
      ))}
      {chord.frets.map((fret, index) => {
        const x = left + index * gapX;
        if (fret < 0) {
          return (
            <text key={index} x={x} y={top - 5} textAnchor="middle" fontSize={7} fill="rgba(255,255,255,0.3)">
              x
            </text>
          );
        }
        if (fret === 0) {
          return (
            <circle key={index} cx={x} cy={top - 6} r={2.2} stroke="rgba(255,255,255,0.4)" strokeWidth={1} />
          );
        }
        return (
          <circle
            key={index}
            cx={x}
            cy={top + (fret - chord.baseFret + 0.5) * gapY}
            r={3.6}
            fill="currentColor"
          />
        );
      })}
    </svg>
  );
}
