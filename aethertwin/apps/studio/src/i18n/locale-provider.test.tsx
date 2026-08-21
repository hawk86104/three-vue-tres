// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { message } from "./format-message";
import { createMemoryLocalePreference } from "./locale-preference";
import { LanguageSwitcher } from "./language-switcher";
import { LocaleProvider, useI18n } from "./locale-provider";

afterEach(cleanup);

function DescriptorProbe() {
  const { format } = useI18n();
  return <output>{format(message("projectCenter.reopenProject", { name: "Aether" }))}</output>;
}

function LocaleProbe() {
  return <output>{useI18n().locale}</output>;
}

describe("LocaleProvider", () => {
  it("reformats retained descriptors immediately after a locale change", async () => {
    const user = userEvent.setup();
    render(<LocaleProvider preference={createMemoryLocalePreference()}><LanguageSwitcher /><DescriptorProbe /></LocaleProvider>);

    expect(screen.getByRole("status")).toHaveTextContent("重新打开“Aether”");
    await user.selectOptions(screen.getByLabelText("界面语言"), "en");
    expect(screen.getByRole("status")).toHaveTextContent("Reopen Aether");
  });

  it("exposes an accessible native switcher with exactly two locale choices", async () => {
    const user = userEvent.setup();
    render(<LocaleProvider preference={createMemoryLocalePreference()}><LanguageSwitcher /></LocaleProvider>);

    const switcher = screen.getByLabelText("界面语言");
    expect([...screen.getAllByRole("option")].map((option) => option.textContent)).toEqual(["简体中文", "English"]);
    await user.selectOptions(switcher, "en");
    expect((switcher as HTMLSelectElement).value).toBe("en");
    expect(screen.getByLabelText("Interface language")).toBe(switcher);
  });

  it("updates and restores the document language while preserving switch focus", async () => {
    const user = userEvent.setup();
    document.documentElement.lang = "fr";
    const rendered = render(<LocaleProvider preference={createMemoryLocalePreference()}><LanguageSwitcher /></LocaleProvider>);
    const switcher = screen.getByLabelText("界面语言");
    switcher.focus();

    expect(document.documentElement.lang).toBe("zh-CN");
    await user.selectOptions(switcher, "en");
    expect(document.documentElement.lang).toBe("en");
    expect(switcher).toHaveFocus();
    rendered.unmount();
    expect(document.documentElement.lang).toBe("fr");
  });

  it("provides a Chinese no-op fallback outside a provider for isolated tests", () => {
    render(<DescriptorProbe />);
    expect(screen.getByRole("status")).toHaveTextContent("重新打开“Aether”");
  });

  it("uses a valid initial locale without writing it to preference storage", () => {
    const write = vi.fn();
    render(
      <LocaleProvider preference={{ read: () => "en", write }} initialLocale="zh-CN">
        <LocaleProbe />
      </LocaleProvider>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("zh-CN");
    expect(write).not.toHaveBeenCalled();
  });

  it("normalizes unsupported runtime initial locales to Chinese", () => {
    render(
      <LocaleProvider
        preference={createMemoryLocalePreference("en")}
        initialLocale={"fr-FR" as never}
      >
        <LocaleProbe />
      </LocaleProvider>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("zh-CN");
    expect(document.documentElement.lang).toBe("zh-CN");
  });
});
