import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  value: number;
  max?: number;
  onChange: (value: number) => void;
  className?: string;
};

/**
 * 变调夹 stepper. The left hand keeps using the same open shapes; every
 * sounding pitch is shifted up by this many semitones.
 */
export function CapoControl({ value, max = 7, onChange, className }: Props) {
  const button =
    "grid size-6 place-items-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-25";

  return (
    <div
      role="group"
      aria-label="变调夹"
      className={cn(
        "hud-panel pointer-events-auto inline-flex items-center gap-0.5 rounded-full p-1",
        className,
      )}
    >
      <button
        type="button"
        aria-label="变调夹降一品"
        disabled={value <= 0}
        onClick={() => onChange(Math.max(0, value - 1))}
        className={button}
      >
        <Minus className="size-3" strokeWidth={2.6} />
      </button>
      <span
        className={cn(
          "min-w-[3.6rem] text-center text-[11px] font-medium tabular-nums transition-colors",
          value > 0 ? "text-strum" : "text-white/45",
        )}
      >
        {value > 0 ? `变调夹 ${value} 品` : "变调夹 关"}
      </span>
      <button
        type="button"
        aria-label="变调夹升一品"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className={button}
      >
        <Plus className="size-3" strokeWidth={2.6} />
      </button>
    </div>
  );
}