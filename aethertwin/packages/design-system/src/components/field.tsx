import { forwardRef, useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: ReactNode;
  helpText?: ReactNode;
  label: ReactNode;
}

function classes(...values: Array<string | undefined | false>): string {
  return values.filter(Boolean).join(" ");
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  {
    "aria-describedby": describedBy,
    "aria-invalid": ariaInvalid,
    className,
    disabled = false,
    error,
    helpText,
    id,
    label,
    required = false,
    ...inputProps
  },
  ref,
) {
  const generatedId = useId().replaceAll(":", "");
  const inputId = id ?? `aether-field-${generatedId}`;
  const helpId = helpText === undefined ? undefined : `${inputId}-help`;
  const errorId = error === undefined ? undefined : `${inputId}-error`;
  const descriptionIds = [describedBy, helpId, errorId].filter(Boolean).join(" ");

  return (
    <div className={classes("aether-field", disabled && "aether-field--disabled")}>
      <label className="aether-field__label" htmlFor={inputId}>
        {label}
        {required ? (
          <span aria-hidden="true" className="aether-field__required">
            *
          </span>
        ) : null}
      </label>
      <input
        {...inputProps}
        ref={ref}
        id={inputId}
        className={classes("aether-field__input", className)}
        aria-describedby={descriptionIds || undefined}
        aria-invalid={error === undefined ? ariaInvalid : true}
        disabled={disabled}
        required={required}
      />
      {helpText === undefined ? null : (
        <p className="aether-field__help" id={helpId}>
          {helpText}
        </p>
      )}
      {error === undefined ? null : (
        <p className="aether-field__error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
});
