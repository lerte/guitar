import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all outline-none disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:border-ring",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_8px_30px_-10px] shadow-primary/50 hover:brightness-110 active:brightness-95",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-white/10",
        outline:
          "border border-white/15 bg-white/[0.03] text-foreground hover:bg-white/[0.08] hover:border-white/25",
        ghost: "text-foreground/80 hover:bg-white/[0.07] hover:text-foreground",
        destructive:
          "bg-destructive/90 text-white hover:bg-destructive focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5",
        sm: "h-8 gap-1.5 px-3.5 text-[13px]",
        lg: "h-12 gap-2.5 px-7 text-[15px]",
        icon: "size-10",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
