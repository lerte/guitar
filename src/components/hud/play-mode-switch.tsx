import type { PlayMode } from "@/lib/hands/gesture-controller";
import { cn } from "@/lib/utils";

type Props = {
  value: PlayMode;
  onChange: (mode: PlayMode) => void;
  className?: string;
};

const OPTIONS: Array<{ value: PlayMode; label: string; hint: string }> = [
  { value: "strum", label: "扫弦", hint: "右手抓握 = 扫弦" },
  { value: "pick", label: "分解", hint: "右手高低选弦，捏合拨弦" },
];

/** Segmented control for the playing technique: strumming vs fingerpicking. */
export function PlayModeSwitch({ value, onChange, className }: Props) {
  return (
    <div
      role="group"
      aria-label="演奏方式"
      className={cn(
        "hud-panel pointer-events-auto inline-flex items-center gap-0.5 rounded-full p-1",
        className,
      )}
    >
      {OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            title={option.hint}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-[11px] font-medium transition-all duration-200",
              active
                ? "bg-primary/15 text-primary shadow-[0_0_22px_-10px] shadow-primary/80"
                : "text-white/45 hover:text-white/85",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
