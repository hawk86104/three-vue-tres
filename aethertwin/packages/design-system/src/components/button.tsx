import { LoaderCircle as LoaderCircleIcon } from "lucide-react";
import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  busy?: boolean;
  variant?: ButtonVariant;
}

function classes(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    busy = false,
    children,
    className,
    disabled = false,
    type = "button",
    variant = "primary",
    ...buttonProps
  },
  ref,
) {
  return (
    <button
      {...buttonProps}
      ref={ref}
      type={type}
      className={classes("aether-button", `aether-button--${variant}`, className)}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
    >
      {busy ? (
        <LoaderCircleIcon
          aria-hidden="true"
          className="aether-button__busy-icon"
          focusable="false"
        />
      ) : null}
      <span className="aether-button__label">{children}</span>
    </button>
  );
});
