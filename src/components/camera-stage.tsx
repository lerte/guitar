import type { RefObject } from "react";
import { cn } from "@/lib/utils";

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  visible: boolean;
};

/** Full-bleed camera feed with a mirrored view and a transparent gesture canvas. */
export function CameraStage({ videoRef, canvasRef, visible }: Props) {
  return (
    <div
      className={cn(
        "absolute inset-0 transition-opacity duration-700",
        visible ? "opacity-100" : "opacity-0",
      )}
      aria-hidden={!visible}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 size-full -scale-x-100 object-cover"
        autoPlay
        playsInline
        muted
        disablePictureInPicture
      />
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 size-full" />
    </div>
  );
}
