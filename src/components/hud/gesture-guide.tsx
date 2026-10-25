import { GESTURE_GUIDE, type ChordId } from "@/lib/guitar/chords";
import type { PlayMode } from "@/lib/hands/gesture-controller";
import { cn } from "@/lib/utils";

type Props = {
  activeChord: ChordId | null;
  playMode?: PlayMode;
  className?: string;
};

export function GestureGuide({ activeChord, playMode = "strum", className }: Props) {
  return (
    <div className={cn("hud-panel pointer-events-auto rounded-2xl p-3", className)}>
      <div className="mb-2 flex items-baseline justify-between gap-3 px-0.5">
        <span className="hud-eyebrow">左手 · 手型对照</span>
        <span className="text-[10px] text-white/35">比出手型并保持 0.1 秒</span>
      </div>

      <div className="grid grid-cols-4 gap-1.5 xl:grid-cols-8">
        {GESTURE_GUIDE.map((entry) => {
          const active = entry.chord === activeChord;
          return (
            <div
              key={entry.pattern}
              title={`${entry.hint} → ${entry.chord ?? "切音"}`}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-xl border px-1 py-1.5 transition-all duration-200",
                active
                  ? "border-primary/60 bg-primary/[0.14] shadow-[0_0_24px_-10px] shadow-primary/80"
                  : "border-white/[0.07] bg-white/[0.02]",
              )}
            >
              <span className="text-[15px] leading-none">{entry.emoji}</span>
              <span
                className={cn(
                  "text-[11px] font-semibold leading-none",
                  active ? "text-primary" : "text-white/75",
                )}
              >
                {entry.chord ?? "切音"}
              </span>
              <span className="text-[9px] leading-none text-white/30">{entry.label}</span>
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
