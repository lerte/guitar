import { Activity, CameraOff, Guitar, Keyboard, Maximize2, Minimize2, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Props = {
  live: boolean;
  keyboardMode: boolean;
  handCount: number;
  fps: number;
  audioReady: boolean;
  fullscreen: boolean;
  settingsOpen: boolean;
  onToggleSettings: () => void;
  onToggleFullscreen: () => void;
  onStop: () => void;
};

function IconButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          onClick={onClick}
          aria-label={label}
          className={cn(
            "size-9 rounded-full border-white/12 bg-black/30 backdrop-blur-xl hover:bg-black/45",
            active && "border-primary/50 bg-primary/15 text-primary",
          )}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function TopBar({
  live,
  keyboardMode,
  handCount,
  fps,
  audioReady,
  fullscreen,
  settingsOpen,
  onToggleSettings,
  onToggleFullscreen,
  onStop,
}: Props) {
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-5">
      <div className="pointer-events-auto flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-2xl border border-white/10 bg-white/[0.05] shadow-[0_10px_30px_-14px_rgba(0,0,0,0.9)] backdrop-blur-xl">
          <Guitar className="size-5 text-primary" strokeWidth={1.7} />
        </div>
        <div className="leading-tight">
          <div className="text-[13px] font-semibold tracking-[0.22em] text-white/90">AIR GUITAR</div>
          <div className="text-[11px] tracking-wide text-white/40">手势吉他 · 实时合成</div>
        </div>
      </div>

      <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
        {live && (
          <>
            {!keyboardMode && (
              <>
                <Badge variant={handCount > 0 ? "success" : "secondary"} className="hidden sm:inline-flex">
                  <Activity className="size-3" />
                  {handCount > 0 ? `${handCount} 只手` : "寻找手部…"}
                </Badge>
                <Badge variant="secondary" className="hidden tabular-nums md:inline-flex">
                  {fps > 0 ? `${fps} FPS` : "—"}
                </Badge>
              </>
            )}
            <Badge variant={audioReady ? "default" : "outline"} className="hidden sm:inline-flex">
              {audioReady ? "音频开启" : "音频待启动"}
            </Badge>
            {keyboardMode && (
              <Badge variant="warning">
                <Keyboard className="size-3" />
                键盘模式
              </Badge>
            )}
          </>
        )}

        {live && (
          <IconButton label="关闭摄像头" onClick={onStop}>
            <CameraOff className="size-4" />
          </IconButton>
        )}
        <IconButton
          label={settingsOpen ? "收起设置" : "设置"}
          onClick={onToggleSettings}
          active={settingsOpen}
        >
          <Settings2 className="size-4" />
        </IconButton>
        <IconButton label={fullscreen ? "退出全屏" : "全屏"} onClick={onToggleFullscreen}>
          {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </IconButton>
      </div>
    </header>
  );
}