import { Camera, Keyboard, Sparkles, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GitHubMark } from "@/components/ui/github-mark";
import { GITHUB_LABEL, GITHUB_URL } from "@/lib/links";
import { cn } from "@/lib/utils";

type Props = {
  error: string | null;
  busy: boolean;
  onStartCamera: () => void;
  onStartKeyboard: () => void;
  className?: string;
};

const STEPS = [
  { step: "01", title: "允许摄像头", detail: "浏览器会请求权限，画面只在本机处理。" },
  { step: "02", title: "左手选和弦", detail: "食指到小指，手指数量对应 7 个开放和弦。" },
  { step: "03", title: "右手扫弦", detail: "握拳下扫、展开上扫，像拿拨片一样交替。" },
];

export function StartScreen({ error, busy, onStartCamera, onStartKeyboard, className }: Props) {
  return (
    <section
      className={cn(
        "absolute inset-0 z-20 flex flex-col items-center justify-center gap-7 overflow-y-auto px-5 py-24",
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-70 [background-image:repeating-linear-gradient(to_bottom,transparent_0px,transparent_41px,rgba(255,255,255,0.045)_42px,transparent_43px)] [mask-image:radial-gradient(70%_60%_at_50%_45%,black,transparent)]"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_60%_at_50%_0%,rgba(99,233,225,0.1),transparent_60%)]" aria-hidden />

      <div className="animate-rise relative flex flex-col items-center gap-5 text-center">
        <Badge variant="secondary" className="gap-1.5 border-white/10 bg-white/[0.04] text-white/60">
          <Sparkles className="size-3 text-primary" />
          Camera · Gesture · Synth
        </Badge>

        <h1 className="text-balance text-5xl font-semibold tracking-tight text-white sm:text-6xl">
          空中<span className="text-primary">吉他</span>
        </h1>

        <p className="max-w-xl text-pretty text-[13px] leading-relaxed text-white/55 sm:text-sm">
          举起左手比出手型选择和弦，右手握拳下扫、展开上扫。手部识别在你的设备上运行，声音由 Web Audio
          的物理建模弦音实时合成 —— 不需要任何乐器。
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <Button size="lg" onClick={onStartCamera} disabled={busy} className="min-w-[9.5rem]">
            <Camera className="size-4" />
            开启摄像头
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={onStartKeyboard}
            disabled={busy}
            className="min-w-[8rem]"
          >
            <Keyboard className="size-4" />
            键盘体验
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-white/35">
          <span>7 个和弦</span>
          <span className="text-white/15">·</span>
          <span>物理建模音色</span>
          <span className="text-white/15">·</span>
          <span>视频不上传</span>
          <span className="text-white/15">·</span>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 rounded-full px-1 text-white/45 underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            aria-label={`在 GitHub 查看源码：${GITHUB_LABEL}`}
          >
            <GitHubMark className="size-3.5" />
            GitHub 源码
          </a>
        </div>
      </div>

      <div className="animate-rise relative grid w-full max-w-2xl gap-2.5 sm:grid-cols-3">
        {STEPS.map((item) => (
          <div
            key={item.step}
            className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3.5 backdrop-blur-xl"
          >
            <div className="mb-1.5 font-mono text-[10px] tracking-[0.2em] text-primary/70">{item.step}</div>
            <div className="text-[13px] font-medium text-white/85">{item.title}</div>
            <p className="mt-1 text-[11px] leading-relaxed text-white/40">{item.detail}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="animate-rise relative flex w-full max-w-xl items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-3.5 text-left">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-red-300" />
          <div className="space-y-1">
            <div className="text-[13px] font-medium text-red-200">无法启动摄像头</div>
            <p className="text-[11px] leading-relaxed text-red-200/70">{error}</p>
            <p className="text-[11px] leading-relaxed text-white/35">
              也可以先用「键盘体验」试听音色，或检查浏览器地址栏的摄像头权限。
            </p>
          </div>
        </div>
      )}

      <p className="relative text-center text-[10px] leading-relaxed text-white/25">
        建议光线充足、手与镜头距离 50–100 cm · 声音需要点击后才会播放（浏览器自动播放策略）
      </p>
    </section>
  );
}
