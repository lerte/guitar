import { GESTURE_SLOTS, type ChordId, type ScaleDegree } from "@/lib/guitar/chords";
import type { PlayMode } from "@/lib/hands/gesture-controller";
import { cn } from "@/lib/utils";

type Props = {
  activeChord: ChordId | null;
  /** The seven diatonic chords of the current key, in scale-degree order. */
  chords: ChordId[];
  degrees: ScaleDegree[];
  keyName: string;
  playMode?: PlayMode;
  className?: string;
};

export function GestureGuide({
  activeChord,
  chords,
  degrees,
  keyName,
  playMode = "strum",
  className,
}: Props) {
  return (
    <div className={cn("hud-panel pointer-events-auto rounded-2xl p-3", className)}>
      <div className="mb-2 flex items-baseline justify-between gap-3 px-0.5">
        <span className="hud-eyebrow">左手 · 手型对照</span>
        <span className="text-[10px] text-white/35">{keyName} · 手指数量 = 音级</span>
      </div>

      <div className="grid grid-cols-4 gap-1.5 xl:grid-cols-8">
        {GESTURE_SLOTS.map((slot) => {
          const degree = slot.degree === null ? null : degrees[slot.degree];
          const chord = slot.degree === null ? null : chords[slot.degree];
          const active = chord !== null && chord === activeChord;
          return (
            <div
              key={slot.pattern}
              title={`${slot.hint} → ${degree ? `${degree.roman} ${chord}` : "切音"}`}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-xl border px-1 py-1.5 transition-all duration-200",
                active
                  ? "border-primary/60 bg-primary/[0.14] shadow-[0_0_24px_-10px] shadow-primary/80"
                  : "border-white/[0.07] bg-white/[0.02]",
              )}
            >
              <span className="text-[15px] leading-none">{slot.emoji}</span>
              <span
                className={cn(
                  "max-w-full truncate text-[10px] font-semibold leading-none",
                  active ? "text-primary" : "text-white/75",
                )}
              >
                {chord ?? "切音"}
              </span>
              <span className="text-[9px] leading-none text-white/30">
                {degree ? degree.roman : slot.label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-2 py-1.5">
        <span className="hud-eyebrow">右手</span>
        <span className="text-[10px] text-white/55">
          {playMode === "pick" ? "上下移动选弦 · 捏合 / 握拳拨弦" : "握拳 = 下扫 · 展开 = 上扫"}
        </span>
      </div>
    </div>
  );
}
