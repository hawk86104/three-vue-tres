import { describe, expect, it } from "vitest";
import type { ConfigEnv, UserConfig } from "vite";
import config from "./vite.config";

async function resolveConfig(mode: string): Promise<UserConfig> {
  if (typeof config !== "function") {
    throw new TypeError("Expected a mode-aware Vite config function");
  }
  return config({ command: "build", mode } as ConfigEnv);
}

describe("Studio Vite Web Demo mode", () => {
  it("enables the flag only in web-demo mode and keeps the portable build shape", async () => {
    const webDemo = await resolveConfig("web-demo");
    const production = await resolveConfig("production");

    expect(webDemo.define).toEqual({
      "import.meta.env.VITE_AETHERTWIN_WEB_DEMO": JSON.stringify("1"),
    });
    expect(production.define).toEqual({
      "import.meta.env.VITE_AETHERTWIN_WEB_DEMO": JSON.stringify("0"),
    });
    expect(webDemo.base).toBe("./");
    expect(webDemo.build).toEqual({ outDir: "dist", emptyOutDir: true });
  });
});
