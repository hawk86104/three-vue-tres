import { describe, expect, it } from "vitest";
import snapshot from "../../../../fixtures/contracts/showroom-demo.v3.json";
import type { DisplayNameSubject, DisplayNameSubjectKind } from "../i18n/display-name-provider";
import { formatMessageDescriptor } from "../i18n/format-message";
import {
  canonicalWebDemoDisplayNameIds,
  resolveWebDemoDisplayName,
} from "./web-demo-display-name-ids";

const canonicalEditorRecords = [
  ["project", [snapshot.project]],
  ["floor", snapshot.project.floors],
  ["layer", snapshot.project.floors.flatMap((floor) => floor.layers)],
  ["plan-reference", snapshot.project.planReferences],
  ["entity", [...snapshot.project.entities, ...snapshot.project.openings]],
  ["product-content", snapshot.project.productContents],
  ["media-asset", snapshot.project.mediaAssets],
  ["route-network", snapshot.project.routeNetworks],
  ["guided-route", snapshot.project.guidedRoutes],
  ["material", snapshot.project.materials],
] as const satisfies readonly [DisplayNameSubjectKind, readonly { readonly id: string; readonly name: string }[]][];

const expectedCanonicalSubjects = canonicalEditorRecords.flatMap(([kind, records]) => records.map(
  ({ id, name }): DisplayNameSubject => ({ kind, id, authoredName: name }),
));

describe("canonical Web Demo display-name ids", () => {
  it("covers every editor-visible named canonical record without mutating the snapshot", () => {
    const before = structuredClone(snapshot);
    const keys = canonicalWebDemoDisplayNameIds.map(({ kind, id }) => `${kind}:${id}`);

    expect(keys).toEqual(expectedCanonicalSubjects.map(({ kind, id }) => `${kind}:${id}`));
    expect(keys).toHaveLength(new Set(keys).size);
    expect(keys).toContain("entity:e2500000-0000-4000-8000-000000000301");
    expect(keys).toContain("entity:e2500000-0000-4000-8000-000000000308");
    expect(keys).toContain("material:e2500000-0000-4000-8000-000000000603");
    expect(snapshot).toEqual(before);
  });

  it("translates known canonical records and leaves unknown same-shaped authored records untouched", () => {
    const known = resolveWebDemoDisplayName({
      kind: "project",
      id: "e2500000-0000-4000-8000-000000000001",
      authoredName: "AetherTwin Showroom Demo",
    });
    const opening = resolveWebDemoDisplayName(expectedCanonicalSubjects.find(
      ({ id }) => id === "e2500000-0000-4000-8000-000000000301",
    )!);
    const material = resolveWebDemoDisplayName(expectedCanonicalSubjects.find(
      ({ id }) => id === "e2500000-0000-4000-8000-000000000603",
    )!);
    const unknown: DisplayNameSubject = {
      kind: "material",
      id: "user-authored-id",
      authoredName: "Customer private name",
    };

    expect(known).not.toBeNull();
    expect(formatMessageDescriptor("zh-CN", known!)).not.toBe("AetherTwin Showroom Demo");
    expect(formatMessageDescriptor("en", known!)).toBe("AetherTwin Showroom Demo");
    expect(formatMessageDescriptor("zh-CN", opening!)).toBe("展厅门 1");
    expect(formatMessageDescriptor("en", opening!)).toBe("Gallery door 1");
    expect(formatMessageDescriptor("zh-CN", material!)).toBe("装置饰面");
    expect(formatMessageDescriptor("en", material!)).toBe("Fixture finish");
    expect(resolveWebDemoDisplayName(unknown)).toBeNull();
  });
});
