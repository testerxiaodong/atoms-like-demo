"use client";
import { useId, type ReactElement } from "react";
import { Tooltip as Primitive } from "@base-ui/react/tooltip";

export function Tooltip({
  label,
  children,
}: {
  label: string;
  children: ReactElement;
}) {
  const descriptionId = useId();
  return (
    <Primitive.Root>
      <Primitive.Trigger
        render={children}
        delay={350}
        aria-describedby={descriptionId}
      />
      <Primitive.Portal>
        <Primitive.Positioner sideOffset={8}>
          <Primitive.Popup
            id={descriptionId}
            role="tooltip"
            className="ui-tooltip"
          >
            {label}
          </Primitive.Popup>
        </Primitive.Positioner>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
