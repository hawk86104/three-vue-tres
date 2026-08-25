// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { createManifest, parseSnapshot } from "@aethertwin/core-model";
import type { SandboxProjectSeed } from "@aethertwin/project-store";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import snapshotFixture from "../../../fixtures/contracts/showroom-demo.v3.json";
import { StudioRoot } from "./studio-root";

const loader = vi.hoisted(() => ({
  loadSeed: vi.fn(),
}));

vi.mock("./web-demo/load-web-demo", () => ({
  WebDemoLoadError: class WebDemoLoadError extends Error {},
  loadWebDemoSeed: loader.loadSeed,
}));

const snapshot = parseSnapshot(snapshotFixture);
const seed: SandboxProjectSeed = Object.freeze({
  openedProject: Object.freeze({
    projectPath: `sandbox://${snapshot.project.id}`,
    manifest: createManifest(snapshot, {
      now: () => "2026-08-09T12:34:56.789Z",
      appVersion: "0.1.0-web-demo",
    }),
    snapshot,
    recovered: false,
  }),
  assets: Object.freeze(snapshot.assets.map((asset) => Object.freeze({
    relativePath: asset.relativePath,
    blob: new Blob([new Uint8Array(asset.size)], { type: asset.mediaType }),
  }))),
});

function denyPersistentAccess(owner: object, key: PropertyKey, accesses: string[]): () => void {
  const prior = Object.getOwnPropertyDescriptor(owner, key);
  Object.defineProperty(owner, key, {
    configurable: true,
    get: () => {
      accesses.push(`${String(key)}:read`);
      throw new Error(`Unexpected persistent API read: ${String(key)}`);
    },
    set: () => {
      accesses.push(`${String(key)}:write`);
      throw new Error(`Unexpected persistent API write: ${String(key)}`);
    },
  });
  return () => {
    if (prior === undefined) Reflect.deleteProperty(owner, key);
    else Object.defineProperty(owner, key, prior);
  };
}

async function waitForPlanEditor() {
  await waitFor(() => expect(document.querySelector(".studio-web-demo-state")).toBeNull());
  expect(screen.getByLabelText("\u754c\u9762\u8bed\u8a00")).toHaveValue("zh-CN");
}

afterEach(() => {
  cleanup();
  loader.loadSeed.mockReset();
});

it("runs the real Web Demo editor assembly without browser persistence and resets locale on remount", async () => {
  loader.loadSeed.mockResolvedValue(seed);
  const user = userEvent.setup();
  const accesses: string[] = [];
  const restore = [
    denyPersistentAccess(window, "localStorage", accesses),
    denyPersistentAccess(window, "sessionStorage", accesses),
    denyPersistentAccess(window, "indexedDB", accesses),
    denyPersistentAccess(window, "caches", accesses),
    denyPersistentAccess(document, "cookie", accesses),
    denyPersistentAccess(navigator, "serviceWorker", accesses),
  ];
  try {
    const first = render(<StudioRoot webDemo />);
    await waitForPlanEditor();
    expect(screen.getByTestId("synchronized-scene-view")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("\u754c\u9762\u8bed\u8a00"), "en");
    expect(screen.getByLabelText("Interface language")).toHaveValue("en");

    first.unmount();
    render(<StudioRoot webDemo />);
    await waitForPlanEditor();
    expect(accesses).toEqual([]);
  } finally {
    for (const release of restore.reverse()) release();
  }
});
