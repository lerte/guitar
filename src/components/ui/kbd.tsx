import * as React from "react";
import { cn } from "@/lib/utils";

function Kbd({ className, children, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-white/15 bg-white/[0.07] px-1.5 font-mono text-[10px] leading-none text-foreground/70 shadow-[inset_0_-1px_0_rgba(255,255,255,0.08)]",
        className,
      )}
      {...props}
    >
      {children}
    </kbd>
  );
}

export { Kbd };
