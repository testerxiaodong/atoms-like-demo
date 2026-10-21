import type { ComponentProps } from "react";
import { cn } from "cn";

export function Badge({ className, ...props }: ComponentProps<"span">) {
  return (
    <span data-slot="badge" className={cn("ui-badge", className)} {...props} />
  );
}
