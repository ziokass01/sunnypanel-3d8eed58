import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl border border-transparent text-sm font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:translate-y-px",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_18px_36px_-24px_hsl(var(--primary)/0.85)] hover:bg-primary/92 hover:shadow-[0_22px_40px_-24px_hsl(var(--primary)/0.9)]",
        hero: "bg-primary text-primary-foreground shadow-elev hover:bg-primary/92",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/92",
        outline: "border-border bg-card text-foreground shadow-sm hover:border-primary/35 hover:bg-primary/10",
        secondary: "bg-slate-800 text-white shadow-sm hover:bg-slate-700",
        soft: "bg-slate-100 text-slate-700 shadow-sm hover:bg-slate-200",
        ghost: "bg-transparent text-slate-600 hover:bg-white/80 hover:text-slate-900",
        link: "rounded-none border-none px-0 text-primary shadow-none hover:underline",
      },
      size: {
        default: "h-11 px-5 py-2.5",
        sm: "h-10 px-4 text-sm",
        lg: "h-12 px-7 text-base",
        icon: "h-11 w-11 rounded-2xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
