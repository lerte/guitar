import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Full-screen boot state while the audio engine / camera / model come up. */
export function BootOverlay({ label, className }: { label: string; className?: string }) {
  return (
    <div
      className={cn(
        "absolute inset-0 z-50 grid place-items-center bg-[#06080e]/85 px-6 backdrop-blur-md",
        className,
      )}
    >
      <div className="flex w-64 flex-col items-center gap-4 text-center">
        <div className="relative size-12">
          <div className="absolute inset-0 rounded-full border border-white/10" />
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
        </div>
        <div className="space-y-1">
          <div className="text-[13px] text-white/80">{label || "启动中"}</div>
          <div className="text-[11px] leading-relaxed text-white/35">
            首次加载需要下载约 8 MB 手部模型
          </div>
        </div>
        <div className="h-0.5 w-full overflow-hidden rounded-full bg-white/10">
          <div className="animate-shimmer h-full w-1/3 rounded-full bg-primary" />
        </div>
      </div>
    </div>
  );
}

/** Small non-blocking status pill used while the model loads mid-session. */
export function LoadingPill({ label, className }: { label: string; className?: string }) {
  return (
    <div
      className={cn(
        "hud-panel animate-rise flex items-center gap-2 rounded-full px-4 py-2 text-[11px] text-white/70",
        className,
      )}
    >
      <span className="size-3 animate-spin rounded-full border border-white/20 border-t-primary" />
      {label || "加载手部模型…"}
    </div>
  );
}

/** Blocking error state for the tracker (model missing, WebGL/WASM failure). */
export function TrackingErrorPanel({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "absolute inset-0 z-40 grid place-items-center bg-[#06080e]/75 px-6 backdrop-blur-sm",
        className,
      )}
    >
      <div className="hud-panel animate-rise w-full max-w-md rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-300" />
          <div className="space-y-1.5">
            <div className="text-[13px] font-medium text-white/90">手部识别没启动起来</div>
            <p className="text-[11px] leading-relaxed text-white/50">{message}</p>
            <p className="text-[11px] leading-relaxed text-white/35">
              确认 <code className="font-mono text-white/60">public/models/hand_landmarker.task</code>{" "}
              存在（可运行 <code className="font-mono text-white/60">npm run assets</code> 重新下载），
              或用键盘体验先试音色。
            </p>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onRetry}>
            重试
          </Button>
        </div>
      </div>
    </div>
  );
}
