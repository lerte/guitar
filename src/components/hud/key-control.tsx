import { useEffect, useRef, useState } from "react";
import { ChevronDown, Music2 } from "lucide-react";
import { MODES, keyScale, type ModeId } from "@/lib/guitar/chords";
import { cn } from "@/lib/utils";

type Props = {
  tonicPc: number;
  modeId: ModeId;
  onChange: (tonicPc: number, modeId: ModeId) => void;
  className?: string;
};

const ROOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/**
 * 调式 picker. Picking a tonic + mode replaces the seven chords behind the
 * seven hand shapes; the shapes themselves never change, so the muscle memory
 * carries over to every key.
 */
export function KeyControl({ tonicPc, modeId, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const scale = keyScale(tonicPc, modeId);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("pointer-events-auto relative", className)}>
      <button
        type="button"
        aria-label="调式"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "hud-panel inline-flex items-center gap-1.5 rounded-full py-1 pl-2.5 pr-2 text-[11px] transition-colors",
          open ? "text-white" : "text-white/70 hover:text-white",
        )}
      >
        <Music2 className="size-3 text-primary/80" />
        <span className="font-medium">{scale.label}</span>
        <ChevronDown
          className={cn("size-3 text-white/35 transition-transform duration-200", open && "rotate-180")}
          strokeWidth={2.4}
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="调式选择"
          className="absolute bottom-full right-0 z-40 mb-2 max-h-[70dvh] w-[19.5rem] overflow-y-auto rounded-2xl border border-white/10 bg-[#0b0f19]/95 p-3 shadow-2xl backdrop-blur-xl scrollbar-slim"
        >
          <div className="mb-2.5 flex items-baseline justify-between">
            <span className="hud-eyebrow">调式</span>
            <span className="text-[10px] text-white/30">12 个调 · 7 种调式</span>
          </div>

          <div className="mb-1 text-[10px] text-white/35">主音</div>
          <div className="grid grid-cols-6 gap-1">
            {ROOTS.map((pc) => {
              const name = keyScale(pc, modeId).tonic;
              const active = pc === tonicPc;
              return (
                <button
                  key={pc}
                  type="button"
                  data-root={pc}
                  onClick={() => onChange(pc, modeId)}
                  className={cn(
                    "rounded-lg border px-1 py-1.5 text-[11px] font-medium transition-colors",
                    active
                      ? "border-primary/60 bg-primary/[0.14] text-primary"
                      : "border-white/[0.08] bg-white/[0.02] text-white/55 hover:text-white/85",
                  )}
                >
                  {name}
                </button>
              );
            })}
          </div>

          <div className="mb-1 mt-3 text-[10px] text-white/35">调式</div>
          <div className="grid grid-cols-2 gap-1">
            {MODES.map((mode) => {
              const active = mode.id === modeId;
              return (
                <button
                  key={mode.id}
                  type="button"
                  data-mode={mode.id}
                  onClick={() => onChange(tonicPc, mode.id)}
                  className={cn(
                    "flex items-baseline justify-between gap-1 rounded-lg border px-2 py-1.5 text-[11px] transition-colors",
                    active
                      ? "border-primary/60 bg-primary/[0.14] text-primary"
                      : "border-white/[0.08] bg-white/[0.02] text-white/55 hover:text-white/85",
                  )}
                >
                  <span className="font-medium">{mode.name}</span>
                  <span className="text-[8.5px] uppercase tracking-wide text-white/25">{mode.en}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-2 py-1.5">
            <div className="flex items-baseline justify-between gap-2 text-[10px]">
              <span className="text-white/50">{scale.label}</span>
              <span className="tabular-nums text-white/35">{scale.notes.join(" ")}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {scale.degrees.map((degree) => (
                <span
                  key={degree.chord}
                  className="rounded-md bg-white/[0.045] px-1.5 py-0.5 text-[10px] text-white/60"
                >
                  <span className="text-white/30">{degree.roman}</span> {degree.chord}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
