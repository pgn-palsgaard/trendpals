import * as React from "react"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-[6px] border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[#EBF0F8] text-[#1D428A]",
        secondary:
          "border-transparent bg-muted text-muted-foreground",
        destructive:
          "border-transparent bg-[#FAE9E5] text-[#C15338]",
        outline: "border-border text-foreground bg-transparent",
        success:
          "border-transparent bg-[#EEF1EC] text-[#4A6040]",
        warning:
          "border-transparent bg-amber-50 text-amber-700",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  ...props
}) {
  return (<div className={cn(badgeVariants({ variant }), className)} {...props} />);
}

export { Badge, badgeVariants }