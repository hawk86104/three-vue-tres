// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
  return {
    WebDemoApp: () => <div data-testid="web-demo">{useI18n().locale}</div>,
  };
});

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

  it("uses initialLocale over persisted storage without persisting the override", () => {
    window.localStorage.setItem("aethertwin.studio.locale.v1", "en");
    const setItem = vi.spyOn(window.localStorage, "setItem");
    render(<StudioRoot webDemo={false} initialLocale="zh-CN" />);

    expect(screen.getByTestId("ordinary-app")).toHaveTextContent("zh-CN");
    expect(setItem).not.toHaveBeenCalled();
  });
});
