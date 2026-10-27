import { AudioLines, Keyboard, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ARPEGGIO_PATTERNS } from "@/lib/guitar/arpeggio";
import { FEEL_RANGES, type FeelTuning } from "@/lib/hands/feel";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  live: boolean;
  muted: boolean;
  volume: number;
  reverb: number;
  swapHands: boolean;
  showSkeleton: boolean;
  showGuide: boolean;
  autoArp: boolean;
  arpBpm: number;
  arpPattern: number;
  feel: FeelTuning;
  onAutoArp: (value: boolean) => void;
  onFeelChange: (feel: FeelTuning) => void;
  onResetFeel: () => void;
  onArpBpm: (value: number) => void;
  onArpPattern: (value: number) => void;
  onVolume: (value: number) => void;
  onReverb: (value: number) => void;
  onSwapHands: (value: boolean) => void;
  onShowSkeleton: (value: boolean) => void;
  onShowGuide: (value: boolean) => void;
  onToggleMute: () => void;
  onStop: () => void;
  className?: string;
};

function ToggleRow({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-3 py-1.5">
      <span className="space-y-0.5">
        <span className="block text-[13px] text-white/80">{label}</span>
        {hint && <span className="block text-[10px] leading-snug text-white/35">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </label>
  );
}

export function ControlPanel({
  open,
  live,
  muted,
  volume,
  reverb,
  swapHands,
  showSkeleton,
  showGuide,
  autoArp,
  arpBpm,
  arpPattern,
  feel,
  onAutoArp,
  onFeelChange,
  onResetFeel,
  onArpBpm,
  onArpPattern,
  onVolume,
  onReverb,
  onSwapHands,
  onShowSkeleton,
  onShowGuide,
  onToggleMute,
  onStop,
  className,
}: Props) {
  if (!open) return null;

  return (
    <div
      className={cn(
        "hud-panel animate-rise scrollbar-slim pointer-events-auto absolute right-4 top-[4.75rem] z-40 max-h-[calc(100dvh-6rem)] w-[19.5rem] overflow-y-auto rounded-2xl p-4",
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="hud-eyebrow">设置</span>
        <span className="text-[10px] text-white/30">实时生效</span>
      </div>

      <div className="space-y-3.5">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[12px] text-white/70">
            <span className="flex items-center gap-1.5">
              <Volume2 className="size-3.5 text-white/40" />
              音量
            </span>
            <span className="tabular-nums text-white/40">{Math.round(volume * 100)}%</span>
          </div>
          <Slider
            value={[Math.round(volume * 100)]}
            min={0}
            max={100}
            step={1}
            aria-label="音量"
            onValueChange={(values) => onVolume((values[0] ?? 0) / 100)}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-[12px] text-white/70">
            <span className="flex items-center gap-1.5">
              <AudioLines className="size-3.5 text-white/40" />
              混响
            </span>
            <span className="tabular-nums text-white/40">{Math.round(reverb * 100)}%</span>
          </div>
          <Slider
            value={[Math.round(reverb * 100)]}
            min={0}
            max={100}
            step={1}
            aria-label="混响"
            onValueChange={(values) => onReverb((values[0] ?? 0) / 100)}
          />
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="flex items-center justify-between text-[12px] text-white/70">
            <span className="flex items-center gap-1.5">
              <AudioLines className="size-3.5 text-white/40" />
              自动分解和弦
            </span>
            <Switch checked={autoArp} onCheckedChange={onAutoArp} aria-label="自动分解和弦" />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {ARPEGGIO_PATTERNS.map((pattern, index) => (
              <button
                key={pattern.id}
                type="button"
                onClick={() => onArpPattern(index)}
                title={pattern.hint}
                className={cn(
                  "rounded-lg border px-2 py-1.5 font-mono text-[10px] tracking-tight transition-colors",
                  index === arpPattern
                    ? "border-primary/50 bg-primary/[0.12] text-primary"
                    : "border-white/[0.08] bg-white/[0.02] text-white/45 hover:text-white/75",
                )}
              >
                {pattern.name}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between text-[10px] text-white/40">
            <span>速度</span>
            <span className="tabular-nums">{arpBpm} BPM · 八分音符</span>
          </div>
          <Slider
            value={[arpBpm]}
            min={50}
            max={160}
            step={2}
            aria-label="分解速度"
            onValueChange={(values) => onArpBpm(values[0] ?? 84)}
          />
          <p className="text-[10px] leading-relaxed text-white/30">
            自动分解按当前和弦循环拨弦；手动分解在画面里用右手高度选弦、捏合拨弦。
          </p>
        </div>

        <Separator />

        <FeelSection feel={feel} onChange={onFeelChange} onReset={onResetFeel} />

        <Separator />

        <div className="space-y-1">
          <ToggleRow
            label="左右手互换"
            hint="默认不互换；和弦/扫弦判断相反时打开"
            checked={swapHands}
            onCheckedChange={onSwapHands}
          />
          <ToggleRow
            label="显示手部骨架"
            hint="关闭后只保留扫弦反馈"
            checked={showSkeleton}
            onCheckedChange={onShowSkeleton}
          />
          <ToggleRow
            label="手型对照卡"
            hint="左下角的和弦手势表"
            checked={showGuide}
            onCheckedChange={onShowGuide}
          />
        </div>

        <Separator />

        <div className="flex items-center gap-2">
          <Button
            variant={muted ? "default" : "outline"}
            size="sm"
            className="flex-1"
            onClick={onToggleMute}
          >
            {muted ? "取消切音" : "切音"}
          </Button>
          {live && (
            <Button variant="outline" size="sm" className="flex-1" onClick={onStop}>
              关闭摄像头
            </Button>
          )}
        </div>

        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] tracking-wide text-white/40">
            <Keyboard className="size-3" />
            键盘快捷键
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px] text-white/45">
            <span className="flex items-center gap-1.5">
              <Kbd>1</Kbd>
              <Kbd>7</Kbd>
              切换音级
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>Space</Kbd>
              下扫
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              扫弦
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>M</Kbd>
              切音
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>F</Kbd>
              全屏
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>H</Kbd>
              对照卡
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>V</Kbd>
              扫弦 / 分解
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>A</Kbd>
              自动分解
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Live gesture tuning. Every slider maps straight onto a knob the controller
 * reads each frame, so dragging has an immediate effect on the next gesture.
 */
function FeelSection({
  feel,
  onChange,
  onReset,
}: {
  feel: FeelTuning;
  onChange: (feel: FeelTuning) => void;
  onReset: () => void;
}) {
  const rows = [
    {
      key: "shapeConfirmMs",
      label: "手型确认",
      hint: "握拳 / 展开要稳定多久才算一次扫弦",
      display: `${feel.shapeConfirmMs} ms`,
      range: FEEL_RANGES.shapeConfirmMs,
      apply: (value: number) => ({ ...feel, shapeConfirmMs: value }),
    },
    {
      key: "strumIntervalMs",
      label: "扫弦间隔",
      hint: "两次扫弦之间最短的间隔，越小越快",
      display: `${feel.strumIntervalMs} ms`,
      range: FEEL_RANGES.strumIntervalMs,
      apply: (value: number) => ({ ...feel, strumIntervalMs: value }),
    },
    {
      key: "grabEnter",
      label: "抓取阈值",
      hint: "握拳判定，越大越难握拳",
      display: feel.grabEnter.toFixed(2),
      range: FEEL_RANGES.grabEnter,
      apply: (value: number) => ({ ...feel, grabEnter: value }),
    },
    {
      key: "pinchEnter",
      label: "捏合阈值",
      hint: "拨弦捏合判定，越小越容易捏合",
      display: feel.pinchEnter.toFixed(2),
      range: FEEL_RANGES.pinchEnter,
      apply: (value: number) => ({ ...feel, pinchEnter: value }),
    },
    {
      key: "chordHoldMs",
      label: "和弦保持",
      hint: "手型要稳定多久才切换和弦",
      display: `${feel.chordHoldMs} ms`,
      range: FEEL_RANGES.chordHoldMs,
      apply: (value: number) => ({ ...feel, chordHoldMs: value }),
    },
  ] as const;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="hud-eyebrow">手感阈值 · 实时生效</span>
        <button
          type="button"
          onClick={onReset}
          className="rounded-full px-2 py-0.5 text-[10px] text-white/35 transition-colors hover:bg-white/10 hover:text-white/80"
        >
          恢复默认
        </button>
      </div>
      {rows.map((row) => (
        <div key={row.key} className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-white/65">
            <span title={row.hint}>{row.label}</span>
            <span className="tabular-nums text-white/40">{row.display}</span>
          </div>
          <Slider
            value={[feel[row.key]]}
            min={row.range.min}
            max={row.range.max}
            step={row.range.step}
            aria-label={row.label}
            onValueChange={(values) => onChange(row.apply(values[0] ?? feel[row.key]))}
          />
        </div>
      ))}
    </div>
  );
}