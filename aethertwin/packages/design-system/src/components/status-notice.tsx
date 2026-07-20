import { forwardRef } from "react";
import type { HTMLAttributes } from "react";

export type StatusNoticeTone = "error" | "saved" | "recovered" | "info";

export interface StatusNoticeProps extends HTMLAttributes<HTMLDivElement> {
  tone?: StatusNoticeTone;
}

export const StatusNotice = forwardRef<HTMLDivElement, StatusNoticeProps>(
  function StatusNotice({ className, tone = "info", ...noticeProps }, ref) {
    const isError = tone === "error";

    return (
      <div
        {...noticeProps}
        ref={ref}
        className={["aether-status-notice", `aether-status-notice--${tone}`, className]
          .filter(Boolean)
          .join(" ")}
        role={isError ? "alert" : "status"}
        aria-live={isError ? "assertive" : "polite"}
        aria-atomic="true"
      />
    );
  },
);
