// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioRoot } from "./studio-root";

vi.mock("./app", async () => {
  const { useI18n } = await import("./i18n/locale-provider");
  return {
    App: () => <div data-testid="ordinary-app">{useI18n().locale}</div>,
  };
});

vi.mock("./web-demo/web-demo-app", async () => {
  const { useI18n } = await import("./i18n/locale-provider");
  const { LanguageSwitcher } = await import("./i18n/language-switcher");
  return {
    WebDemoApp: () => <><LanguageSwitcher /><div data-testid="web-demo">{useI18n().locale}</div></>,
  };
});

function denyPersistentAccess(owner: object, key: PropertyKey): () => void {
  const prior = Object.getOwnPropertyDescriptor(owner, key);
  Object.defineProperty(owner, key, {
    configurable: true,
    get: () => { throw new Error(`Unexpected persistent API read: ${String(key)}`); },
    set: () => { throw new Error(`Unexpected persistent API write: ${String(key)}`); },
  });
  return () => {
    if (prior === undefined) Reflect.deleteProperty(owner, key);
    else Object.defineProperty(owner, key, prior);
  };
}

afterEach(cleanup);

describe("StudioRoot", () => {
  it("mounts only the Web Demo in the dedicated mode", () => {
    render(<StudioRoot webDemo />);

    expect(screen.getByTestId("web-demo")).toBeInTheDocument();
    expect(screen.queryByTestId("ordinary-app")).not.toBeInTheDocument();
  });

  it("mounts only the ordinary app outside the dedicated mode", () => {
    render(<StudioRoot webDemo={false} />);

    expect(screen.getByTestId("ordinary-app")).toBeInTheDocument();
    expect(screen.queryByTestId("web-demo")).not.toBeInTheDocument();
  });

  it("uses persisted browser preference for normal Studio", () => {
    window.localStorage.setItem("aethertwin.studio.locale.v1", "en");
    render(<StudioRoot webDemo={false} />);

    expect(screen.getByTestId("ordinary-app")).toHaveTextContent("en");
  });

  it("uses a fresh memory preference for Web Demo without touching browser storage", () => {
    window.localStorage.setItem("aethertwin.studio.locale.v1", "en");
    const getItem = vi.spyOn(window.localStorage, "getItem");
    render(<StudioRoot webDemo />);

    expect(screen.getByTestId("web-demo")).toHaveTextContent("zh-CN");
    expect(getItem).not.toHaveBeenCalledWith("aethertwin.studio.locale.v1");
  });

  it("switches Web Demo language in memory only and resets after remount without persistent API access", async () => {
    const user = userEvent.setup();
    const restore = [
      denyPersistentAccess(window, "localStorage"),
      denyPersistentAccess(window, "sessionStorage"),
      denyPersistentAccess(window, "indexedDB"),
      denyPersistentAccess(window, "caches"),
      denyPersistentAccess(document, "cookie"),
      denyPersistentAccess(navigator, "serviceWorker"),
    ];
    try {
      const first = render(<StudioRoot webDemo />);
      expect(screen.getByTestId("web-demo")).toHaveTextContent("zh-CN");
      await user.selectOptions(screen.getByLabelText("界面语言"), "en");
      expect(screen.getByTestId("web-demo")).toHaveTextContent("en");

      first.unmount();
      render(<StudioRoot webDemo />);
      expect(screen.getByTestId("web-demo")).toHaveTextContent("zh-CN");
    } finally {
      for (const release of restore.reverse()) release();
    }
  });

  it("uses initialLocale over persisted storage without persisting the override", () => {
    window.localStorage.setItem("aethertwin.studio.locale.v1", "en");
    const setItem = vi.spyOn(window.localStorage, "setItem");
    render(<StudioRoot webDemo={false} initialLocale="zh-CN" />);

    expect(screen.getByTestId("ordinary-app")).toHaveTextContent("zh-CN");
    expect(setItem).not.toHaveBeenCalled();
  });
});
