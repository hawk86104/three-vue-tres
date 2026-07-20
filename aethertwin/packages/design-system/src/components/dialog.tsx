import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X as XIcon } from "lucide-react";
import { forwardRef, useRef } from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

type DialogContentProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Content>;
type DialogOverlayProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>;

export interface DialogProps extends Omit<DialogContentProps, "title"> {
  closeLabel?: string;
  defaultOpen?: boolean;
  description?: ReactNode;
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

export const Dialog = forwardRef<HTMLDivElement, DialogProps>(function Dialog(
  {
    "aria-describedby": ariaDescribedBy,
    children,
    className,
    closeLabel = "关闭",
    defaultOpen,
    description,
    modal,
    onCloseAutoFocus,
    onOpenAutoFocus,
    onOpenChange,
    open,
    overlayClassName,
    overlayProps,
    title,
    ...contentProps
  },
  ref,
) {
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const optionalRootProps = {
    ...(open === undefined ? {} : { open }),
    ...(defaultOpen === undefined ? {} : { defaultOpen }),
    ...(modal === undefined ? {} : { modal }),
    ...(onOpenChange === undefined ? {} : { onOpenChange }),
  };
  const descriptionProps =
    description === undefined
      ? { "aria-describedby": undefined }
      : ariaDescribedBy === undefined
        ? {}
        : { "aria-describedby": ariaDescribedBy };

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
          {...descriptionProps}
          ref={ref}
          className={classes("aether-dialog__content", className)}
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
        >
          <DialogPrimitive.Title className="aether-dialog__title">
            {title}
          </DialogPrimitive.Title>
          {description === undefined ? null : (
            <DialogPrimitive.Description className="aether-dialog__description">
              {description}
            </DialogPrimitive.Description>
          )}
          {children}
          <DialogPrimitive.Close asChild>
            <button className="aether-dialog__close" type="button" aria-label={closeLabel}>
              <XIcon aria-hidden="true" focusable="false" size={18} />
            </button>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
});
