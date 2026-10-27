import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import {
  chordMatches,
  GESTURE_SLOTS,
  type ChordId,
  type ChordQuality,
  type GestureSlot,
  type ScaleDegree,
} from "@/lib/guitar/chords";
import {
  bindingFor,
  CHORD_GROUPS,
  type GestureMap,
} from "@/lib/guitar/gesture-map";
import { cn } from "@/lib/utils";

type Props = {
  gestures: GestureMap;
  /** The seven diatonic chords of the current key, in scale-degree order. */
  chords: ChordId[];
  degrees: ScaleDegree[];
  onAssign: (pattern: string, value: ChordId | null | undefined) => void;
  onReset: () => void;
  /** Play a chord once so the assignment can be heard right away. */
  onPreview?: (chord: ChordId) => void;
};

function defaultLabel(slot: GestureSlot, chords: ChordId[]) {
  if (slot.degree === null) return "切音";
  return chords[slot.degree] ?? "—";
}

/** A stored chord may be spelled differently from the key's own spelling. */
function sameChord(label: ChordId, pc: number, quality: ChordQuality) {
  return chordMatches(label, pc, quality);
}

/**
 * 手势和弦: pin a left-hand shape to one chord, or leave it blank. Blank shapes
 * are ignored entirely — the chord that is already sounding keeps ringing, so a
 * shape that keeps misfiring can be defused instead of muted.
 */
export function GestureMapSection({ gestures, chords, degrees, onAssign, onReset, onPreview }: Props) {
  const [openPattern, setOpenPattern] = useState<string | null>(null);
  const overrides = GESTURE_SLOTS.filter((slot) => slot.pattern in gestures).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="hud-eyebrow">手势和弦 · 左手</span>
        <button
          type="button"
          onClick={onReset}
          disabled={overrides === 0}
          className="rounded-full px-2 py-0.5 text-[10px] text-white/35 transition-colors hover:bg-white/10 hover:text-white/80 disabled:pointer-events-none disabled:opacity-35"
        >
          恢复默认
        </button>
      </div>

      <p className="text-[10px] leading-relaxed text-white/30">
        每个手型可以指定固定和弦，或留空（不响应）。默认跟随当前调式的音级。
      </p>

      <div className="space-y-1">
        {GESTURE_SLOTS.map((slot) => {
          const binding = bindingFor(gestures, slot.pattern, slot.degree);
          const fallback = defaultLabel(slot, chords);
          const open = openPattern === slot.pattern;
          const value =
            binding.kind === "none"
              ? "留空"
              : binding.kind === "mute"
                ? "切音"
                : binding.kind === "chord"
                  ? binding.chord
                  : (chords[binding.degree] ?? "—");
          const note =
            binding.kind === "degree"
              ? (degrees[binding.degree]?.roman ?? "")
              : binding.kind === "chord"
                ? "固定"
                : binding.kind === "mute"
                  ? "默认"
                  : "不响应";

          return (
            <div
              key={slot.pattern}
              className={cn(
                "rounded-xl border transition-colors",
                open ? "border-primary/30 bg-primary/[0.04]" : "border-white/[0.06] bg-white/[0.02]",
              )}
            >
              <button
                type="button"
                aria-expanded={open}
                aria-label={`${slot.label}和弦`}
                onClick={() => setOpenPattern(open ? null : slot.pattern)}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
              >
                <span className="w-5 shrink-0 text-center text-[13px] leading-none">{slot.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] text-white/70">{slot.label}</span>
                  <span className="block truncate text-[9px] text-white/30">{slot.hint}</span>
                </span>
                <span className="flex shrink-0 items-baseline gap-1.5">
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-none",
                      binding.kind === "chord"
                        ? "bg-primary/15 text-primary"
                        : binding.kind === "none"
                          ? "bg-white/[0.03] text-white/30"
                          : "bg-white/[0.05] text-white/60",
                    )}
                  >
                    {value}
                  </span>
                  <span className="w-6 text-[8.5px] text-white/25">{note}</span>
                </span>
                <ChevronDown
                  className={cn(
                    "size-3 shrink-0 text-white/30 transition-transform duration-200",
                    open && "rotate-180",
                  )}
                  strokeWidth={2.4}
                />
              </button>

              {open && (
                <div className="border-t border-white/[0.06] px-1.5 pb-1.5 pt-1.5">
                  <div className="grid grid-cols-2 gap-1">
                    <OptionButton
                      active={binding.kind === "degree"}
                      onClick={() => onAssign(slot.pattern, undefined)}
                    >
                      跟随调式 · {fallback}
                    </OptionButton>
                    <OptionButton
                      active={binding.kind === "none"}
                      onClick={() => onAssign(slot.pattern, null)}
                    >
                      留空 · 不响应
                    </OptionButton>
                  </div>

                  {CHORD_GROUPS.map((group) => (
                    <div key={group.quality} className="mt-1.5">
                      <div className="mb-1 text-[9px] tracking-wide text-white/30">{group.label}</div>
                      <div className="grid grid-cols-6 gap-1">
                        {group.chords.map((option) => {
                          const active =
                            binding.kind === "chord" &&
                            sameChord(binding.chord, option.pc, option.quality);
                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => {
                                onAssign(slot.pattern, option.id);
                                onPreview?.(option.id);
                              }}
                              className={cn(
                                "rounded-md border px-0.5 py-1 text-[10px] leading-none transition-colors",
                                active
                                  ? "border-primary/60 bg-primary/[0.14] text-primary"
                                  : "border-white/[0.07] bg-white/[0.02] text-white/50 hover:text-white/85",
                              )}
                            >
                              {option.id}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OptionButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-2 py-1.5 text-[10px] leading-none transition-colors",
        active
          ? "border-primary/60 bg-primary/[0.14] text-primary"
          : "border-white/[0.08] bg-white/[0.02] text-white/50 hover:text-white/85",
      )}
    >
      {children}
    </button>
  );
}
