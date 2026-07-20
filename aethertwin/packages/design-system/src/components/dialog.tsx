import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X as XIcon } from "lucide-react";
import { forwardRef, useId, useRef } from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

type DialogContentProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Content>;
type DialogOverlayProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>;

export interface DialogProps extends Omit<DialogContentProps, "title"> {
  closeLabel?: string;
  defaultOpen?: boolean;
  description?: ReactNode;
  dismissible?: boolean;
  modal?: boolean;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  overlayClassName?: string;
  overlayProps?: DialogOverlayProps;
  title: ReactNode;
}

function classes(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function mergeIds(...values: Array<string | undefined>): string | undefined {
  const ids = values.flatMap((value) => value?.split(/\s+/).filter(Boolean) ?? []);
  const merged = [...new Set(ids)].join(" ");
  return merged || undefined;
}

export const Dialog = forwardRef<HTMLDivElement, DialogProps>(function Dialog(
  {
    "aria-describedby": ariaDescribedBy,
    children,
    className,
    closeLabel = "关闭",
    defaultOpen,
    description,
    dismissible = true,
    modal,
    onCloseAutoFocus,
    onEscapeKeyDown,
    onOpenAutoFocus,
    onOpenChange,
    onPointerDownOutside,
    open,
    overlayClassName,
    overlayProps,
    title,
    ...contentProps
  },
  ref,
) {
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const generatedDescriptionId = `aether-dialog-description-${useId().replaceAll(":", "")}`;
  const descriptionId = description === undefined ? undefined : generatedDescriptionId;
  const mergedDescriptionIds = mergeIds(ariaDescribedBy, descriptionId);
  const optionalRootProps = {
    ...(open === undefined ? {} : { open }),
    ...(defaultOpen === undefined ? {} : { defaultOpen }),
    ...(modal === undefined ? {} : { modal }),
    ...(onOpenChange === undefined ? {} : { onOpenChange }),
  };
  return (
    <DialogPrimitive.Root {...optionalRootProps}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          {...overlayProps}
          className={classes(
            "aether-dialog__overlay",
            overlayClassName,
            overlayProps?.className,
          )}
        />
        <DialogPrimitive.Content
          {...contentProps}
          ref={ref}
          className={classes("aether-dialog__content", className)}
          aria-describedby={mergedDescriptionIds}
          onOpenAutoFocus={(event) => {
            returnFocusRef.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
            onOpenAutoFocus?.(event);
          }}
          onCloseAutoFocus={(event) => {
            onCloseAutoFocus?.(event);
            if (!event.defaultPrevented) {
              event.preventDefault();
              returnFocusRef.current?.focus();
            }
          }}
          onEscapeKeyDown={(event) => {
            onEscapeKeyDown?.(event);
            if (!dismissible) {
              event.preventDefault();
            }
          }}
          onPointerDownOutside={(event) => {
            onPointerDownOutside?.(event);
            if (!dismissible) {
              event.preventDefault();
            }
          }}
        >
          <DialogPrimitive.Title className="aether-dialog__title">
            {title}
          </DialogPrimitive.Title>
          {description === undefined ? null : (
            <DialogPrimitive.Description
              className="aether-dialog__description"
              id={descriptionId}
            >
              {description}
            </DialogPrimitive.Description>
          )}
          {children}
          <DialogPrimitive.Close asChild>
            <button
              className="aether-dialog__close"
              type="button"
              aria-label={closeLabel}
              disabled={!dismissible}
            >
              <XIcon aria-hidden="true" focusable="false" size={18} />
            </button>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
});
