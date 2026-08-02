import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
  {
    variants: {
      tone: {
        neutral: "bg-surface-muted text-muted-foreground ring-border",
        accent: "bg-accent/10 text-accent ring-accent/20",
        positive: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400",
        warning: "bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-400",
        negative: "bg-rose-500/10 text-rose-600 ring-rose-500/20 dark:text-rose-400",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
