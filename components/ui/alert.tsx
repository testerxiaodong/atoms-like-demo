import type { ComponentProps } from "react";
import { cn } from "cn";

export function Alert({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      role="alert"
      data-slot="alert"
      className={cn("error-banner", className)}
      {...props}
    />
  );
}
