import type { PlayMode } from "@/lib/hands/gesture-controller";
import { STRING_LABELS, transposeChordLabel, type ChordId } from "@/lib/guitar/chords";
import { cn } from "@/lib/utils";

type Props = {
  chord: ChordId | null;
  muted: boolean;
  fingers: number;
  leftPresent: boolean;
  rightPresent: boolean;
  playMode: PlayMode;
  targetString: number | null;
  engaging: boolean;
  grabbing: boolean;
  capo: number;
  keyboardMode: boolean;
};

/**
 * Fixed recognition readouts: the left hand's chord on the left edge, the right
 * hand's gesture on the right edge, both vertically centred. They never follow
 * the hand — after a while you only glance at one side of the screen.
 */
export function HandReadouts({
  chord,
  muted,
  fingers,
  leftPresent,
  rightPresent,
  playMode,
  targetString,
  engaging,
  grabbing,
  capo,
  keyboardMode,
}: Props) {
  const leftActive = leftPresent || keyboardMode;
  const picking = playMode === "pick";

  const rightValue = !rightPresent
    ? "—"
    : picking
      ? targetString !== null
        ? `${6 - targetString} · ${STRING_LABELS[targetString]}`
        : "—"
      : grabbing
        ? "↓ 下扫"
        : "↑ 上扫";

  const rightHint = keyboardMode
    ? "键盘模式"
    : !rightPresent
      ? "未检测到手"
      : picking
        ? engaging
          ? "拨弦中"
          : "捏合拨弦"
        : "握拳 / 展开";

  return (
    <>
      <div className="pointer-events-none absolute left-4 top-1/2 z-20 -translate-y-1/2 sm:left-6">
        <div
          className={cn(
            "hud-panel w-[9.75rem] rounded-2xl px-3 py-2.5 transition-opacity duration-300",
            leftActive ? "opacity-100" : "opacity-55",
          )}
        >
          <div className="flex items-center gap-1.5">
            <span
              className={cn("size-1.5 rounded-full", leftActive ? "bg-chord" : "bg-white/25")}
            />
            <span className="hud-eyebrow">左手 · 和弦</span>
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span
              className={cn(
                "chord-glyph text-[34px] font-semibold leading-none",
                muted ? "text-white/30" : leftActive ? "text-white" : "text-white/45",
              )}
            >
              {muted ? "—" : (chord ?? "—")}
            </span>
            {!muted && chord && capo > 0 && (
              <span className="text-[10px] font-medium text-strum">
                → {transposeChordLabel(chord, capo)}
              </span>
            )}
          </div>
          <div className="mt-1 text-[10px] text-white/45">
            {keyboardMode
              ? "键盘选择"
              : !leftPresent
                ? "未检测到手"
                : muted
                  ? "握拳 · 切音"
                  : `${fingers} 指`}
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute right-4 top-1/2 z-20 -translate-y-1/2 sm:right-6">
        <div
          className={cn(
            "hud-panel w-[9.75rem] rounded-2xl px-3 py-2.5 text-right transition-opacity duration-300",
            rightPresent ? "opacity-100" : "opacity-55",
          )}
        >
          <div className="flex items-center justify-end gap-1.5">
            <span className="hud-eyebrow">右手 · {picking ? "分解" : "扫弦"}</span>
            <span
              className={cn("size-1.5 rounded-full", rightPresent ? "bg-strum" : "bg-white/25")}
            />
          </div>
          <div
            className={cn(
              "mt-1.5 text-[24px] font-semibold leading-none tabular-nums",
              rightPresent ? "text-white" : "text-white/40",
            )}
          >
            {rightValue}
          </div>
          <div className="mt-1 text-[10px] text-white/45">{rightHint}</div>
        </div>
      </div>
    </>
  );
}