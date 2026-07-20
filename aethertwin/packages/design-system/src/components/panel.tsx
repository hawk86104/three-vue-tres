import { forwardRef } from "react";
import type { HTMLAttributes } from "react";

export type PanelProps = HTMLAttributes<HTMLElement>;

export const Panel = forwardRef<HTMLElement, PanelProps>(function Panel(
  { className, ...panelProps },
  ref,
) {
  return (
    <section
      {...panelProps}
      ref={ref}
      className={["aether-panel", className].filter(Boolean).join(" ")}
    />
  );
});
