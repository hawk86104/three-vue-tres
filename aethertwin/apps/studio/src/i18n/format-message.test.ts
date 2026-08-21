import { describe, expect, it } from "vitest";
import {
  formatMessage,
  message,
  type StudioMessageCatalogue,
  type StudioMessageId,
} from "./format-message";
import { enMessages } from "./messages.en";

describe("formatMessage", () => {
  it("formats every catalogue parameter tuple in Chinese and English", () => {
    expect(formatMessage("zh-CN", "locale.controlLabel")).toBe("界面语言");
    expect(formatMessage("en", "locale.controlLabel")).toBe("Interface language");
    expect(formatMessage("zh-CN", "locale.zh-CN")).toBe("简体中文");
    expect(formatMessage("en", "locale.en")).toBe("English");
    expect(formatMessage("zh-CN", "projectCenter.reopenProject", { name: "青云" }))
      .toBe("重新打开“青云”");
    expect(formatMessage("en", "projectCenter.reopenProject", { name: "Aether" }))
      .toBe("Reopen Aether");
    expect(formatMessage("zh-CN", "projectCenter.projectCount", { count: 2 }))
      .toBe("共 2 个项目");
    expect(formatMessage("en", "projectCenter.projectCount", { count: 1 }))
      .toBe("1 project");
    expect(formatMessage("en", "projectCenter.projectCount", { count: 2 }))
      .toBe("2 projects");
  });

  it("creates descriptors that retain their typed arguments", () => {
    expect(message("projectCenter.reopenProject", { name: "青云" })).toEqual({
      id: "projectCenter.reopenProject",
      args: [{ name: "青云" }],
    });
  });

  it("uses a Chinese UI-safe fallback for invalid runtime identifiers", () => {
    expect(formatMessage("en", "missing.runtime.id" as StudioMessageId)).toBe("界面文本不可用");
  });
});

const checkedEnglishCatalogue = enMessages satisfies StudioMessageCatalogue;
void checkedEnglishCatalogue;

const wrongParameterCatalogue = {
  ...enMessages,
  // @ts-expect-error English entries must preserve the Chinese parameter tuple.
  "projectCenter.reopenProject": ({ name }: { readonly name: number }) => `Reopen ${name}`,
} satisfies StudioMessageCatalogue;
void wrongParameterCatalogue;
