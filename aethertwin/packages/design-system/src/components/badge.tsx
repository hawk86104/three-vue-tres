import { forwardRef } from "react";
import type { HTMLAttributes } from "react";

export type BadgeTone = "neutral" | "accent" | "success" | "danger";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, tone = "neutral", ...badgeProps },
  ref,
) {
  return (
    <span
      {...badgeProps}
      ref={ref}
      className={["aether-badge", `aether-badge--${tone}`, className]
        .filter(Boolean)
        .join(" ")}
    />
  );
});
