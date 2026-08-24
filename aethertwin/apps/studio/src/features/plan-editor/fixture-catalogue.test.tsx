// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider, useI18n } from "../../i18n/locale-provider";
import { FixtureCatalogue } from "./fixture-catalogue";

afterEach(cleanup);

function SwitchToEnglish() {
  const { setLocale } = useI18n();
  return <button type="button" onClick={() => setLocale("en")}>switch</button>;
}

function FixtureHarness({ onSelect }: { readonly onSelect: (kind: "display-table") => void }) {
  const [selected, setSelected] = useState<"display-table" | null>(null);
  return <FixtureCatalogue selectedKind={selected} onSelect={(kind) => {
    if (kind === "display-table") setSelected(kind);
    if (kind === "display-table") onSelect(kind);
  }} />;
}

describe("FixtureCatalogue", () => {
  it("renders exactly seven accessible showroom choices with exact W/D/H defaults", () => {
    render(
      <FixtureCatalogue
        selectedKind="screen"
        onSelect={vi.fn()}
      />,
    );

    const catalogue = screen.getByRole("region", { name: "陈设目录" });
    const buttons = within(catalogue).getAllByRole("button");
    expect(buttons).toHaveLength(7);
    expect(buttons.map((button) => button.textContent)).toEqual([
      "展示柜宽 1200 mm · 深 600 mm · 高 1200 mm",
      "展示桌宽 1500 mm · 深 750 mm · 高 900 mm",
      "货架宽 1000 mm · 深 400 mm · 高 2000 mm",
      "收银台宽 1600 mm · 深 700 mm · 高 1000 mm",
      "屏幕宽 1200 mm · 深 100 mm · 高 1800 mm",
      "隔断宽 1200 mm · 深 100 mm · 高 2400 mm",
      "标牌宽 600 mm · 深 100 mm · 高 1800 mm",
    ]);
    expect(buttons.map((button) => button.getAttribute("aria-pressed"))).toEqual([
      "false",
      "false",
      "false",
      "false",
      "true",
      "false",
      "false",
    ]);
  });

  it("reports the selected immutable catalogue kind", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<FixtureCatalogue selectedKind={null} onSelect={onSelect} />);

    await user.click(screen.getByRole("button", { name: /展示桌/ }));

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith("display-table");
  });

  it("reformats all fixture names and dimensions in English without changing the raw kind", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <LocaleProvider preference={{ read: () => "en", write: () => undefined }}>
        <FixtureCatalogue selectedKind={null} onSelect={onSelect} />
      </LocaleProvider>,
    );

    const catalogue = screen.getByRole("region", { name: "Fixture catalogue" });
    expect(within(catalogue).getByRole("button", { name: /Display table/ }))
      .toHaveTextContent("W 1500 mm · D 750 mm · H 900 mm");
    await user.click(within(catalogue).getByRole("button", { name: /Display table/ }));
    expect(onSelect).toHaveBeenCalledWith("display-table");
  });

  it("keeps the selected fixture through a live switch without another callback", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<LocaleProvider preference={{ read: () => "zh-CN", write: () => undefined }}><SwitchToEnglish /><FixtureHarness onSelect={onSelect} /></LocaleProvider>);
    await user.click(screen.getByRole("button", { name: /展示桌/ }));
    expect(onSelect).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "switch" }));
    expect(screen.getByRole("button", { name: /Display table/ })).toHaveAttribute("aria-pressed", "true");
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
