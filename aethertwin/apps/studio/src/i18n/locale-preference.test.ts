import { describe, expect, it, vi } from "vitest";
import {
  createBrowserLocalePreference,
  createMemoryLocalePreference,
} from "./locale-preference";

describe("browser locale preference", () => {
  it("falls back to Chinese for missing, invalid, and unavailable storage", () => {
    expect(createBrowserLocalePreference({ getItem: () => null, setItem: () => undefined }).read()).toBeNull();
    expect(createBrowserLocalePreference({ getItem: () => "fr-FR", setItem: () => undefined }).read()).toBeNull();
    expect(createBrowserLocalePreference({
      getItem: () => { throw new Error("blocked"); }, setItem: () => undefined,
    }).read()).toBeNull();
  });

  it("persists only supported locale values under the Studio locale key", () => {
    const getItem = vi.fn(() => "en");
    const setItem = vi.fn();
    const preference = createBrowserLocalePreference({ getItem, setItem });

    expect(preference.read()).toBe("en");
    preference.write("zh-CN");

    expect(getItem).toHaveBeenCalledWith("aethertwin.studio.locale.v1");
    expect(setItem).toHaveBeenCalledWith("aethertwin.studio.locale.v1", "zh-CN");
  });

  it("keeps document selection usable when persistence writes fail", () => {
    const preference = createBrowserLocalePreference({
      getItem: () => null,
      setItem: () => { throw new Error("quota"); },
    });

    expect(() => preference.write("en")).not.toThrow();
  });
});

describe("memory locale preference", () => {
  it("reads and writes in memory without requiring browser storage", () => {
    const preference = createMemoryLocalePreference();
    expect(preference.read()).toBeNull();
    preference.write("en");
    expect(preference.read()).toBe("en");
  });
});
