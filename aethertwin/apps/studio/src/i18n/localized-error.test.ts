import { describe, expect, it } from "vitest";
import { formatMessageDescriptor } from "./format-message";
import {
  LOCALIZED_ERROR_CODES,
  localizedErrorDescriptor,
  localizedErrorLogRef,
} from "./localized-error";
import { ProjectBackendError } from "../backend/project-backend-error";

const secret = "C:\\Users\\agent\\private-project\\manifest.json";

describe("localized safe errors", () => {
  it.each(LOCALIZED_ERROR_CODES)("maps %s to safe localized descriptors", (code) => {
    const error = { code, message: secret, details: { path: secret, token: "secret" } };
    const zh = formatMessageDescriptor("zh-CN", localizedErrorDescriptor(error));
    const en = formatMessageDescriptor("en", localizedErrorDescriptor(error));

    expect(localizedErrorDescriptor(error).id).not.toBe("error.generic");

    expect(zh).not.toEqual("");
    expect(en).not.toEqual("");
    expect(`${zh}${en}`).not.toContain(secret);
    expect(`${zh}${en}`).not.toContain("secret");
  });

  it("uses the locked PROJECT_LOCKED descriptors", () => {
    const descriptor = localizedErrorDescriptor({ code: "PROJECT_LOCKED" });

    expect(formatMessageDescriptor("zh-CN", descriptor)).toBe(
      "该项目正在其他窗口中使用，请关闭后重试。",
    );
    expect(formatMessageDescriptor("en", descriptor)).toBe(
      "This project is open in another window. Close it and try again.",
    );
  });

  it("maps export-result action failures to the established export-safe descriptor", () => {
    const error = { code: "EXPORT_RESULT_ACTION_FAILED", message: secret };

    expect(localizedErrorDescriptor(error).id).toBe("error.exportOperation");
    expect(formatMessageDescriptor("zh-CN", localizedErrorDescriptor(error))).not.toContain(secret);
    expect(formatMessageDescriptor("en", localizedErrorDescriptor(error))).not.toContain(secret);
  });

  it("uses a generic fallback and preserves only a separately rendered log reference", () => {
    const error = new ProjectBackendError("UNKNOWN_NATIVE_FAILURE", secret, null, "log-7e2d");
    const descriptor = localizedErrorDescriptor(error);

    expect(formatMessageDescriptor("zh-CN", descriptor)).not.toContain(secret);
    expect(formatMessageDescriptor("en", descriptor)).not.toContain(secret);
    expect(localizedErrorLogRef(error)).toBe("log-7e2d");
    expect(localizedErrorLogRef({ logRef: secret })).toBeNull();
    expect(localizedErrorLogRef(Object.assign(new Error(secret), { logRef: "spoofed-log" }))).toBeNull();
  });

  it("treats synthetic commit failures as unknown and redacts their details", () => {
    const error = { code: "COMMIT_FAILED", message: secret, details: { path: secret } };

    expect(localizedErrorDescriptor(error).id).toBe("error.generic");
    expect(formatMessageDescriptor("zh-CN", localizedErrorDescriptor(error))).not.toContain(secret);
    expect(formatMessageDescriptor("en", localizedErrorDescriptor(error))).not.toContain(secret);
  });
});
