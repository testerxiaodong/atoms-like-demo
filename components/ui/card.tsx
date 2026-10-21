import type { ComponentProps } from "react";
import { cn } from "cn";

export function Card({ className, ...props }: ComponentProps<"article">) {
  return (
    <article data-slot="card" className={cn("ui-card", className)} {...props} />
  );
}
