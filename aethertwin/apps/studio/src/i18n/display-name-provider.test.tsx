// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { message } from "./format-message";
import { DisplayNameProvider, type DisplayNameSubject, useDisplayName } from "./display-name-provider";
import { createMemoryLocalePreference } from "./locale-preference";
import { LocaleProvider } from "./locale-provider";

afterEach(cleanup);

const subject: DisplayNameSubject = { kind: "project", id: "project-1", authoredName: "原创项目名称" };

function NameProbe({ value }: { readonly value: DisplayNameSubject }) {
  const displayName = useDisplayName();
  return <output>{displayName(value)}</output>;
}

describe("DisplayNameProvider", () => {
  it("returns authored names exactly through the default resolver without mutation", () => {
    const before = structuredClone(subject);
    render(<LocaleProvider preference={createMemoryLocalePreference()}><DisplayNameProvider><NameProbe value={subject} /></DisplayNameProvider></LocaleProvider>);

    expect(screen.getByRole("status")).toHaveTextContent("原创项目名称");
    expect(subject).toEqual(before);
  });

  it("formats descriptor overrides only within the provider scope", () => {
    const resolver = (value: DisplayNameSubject) => value.kind === "project"
      ? message("projectCenter.reopenProject", { name: value.authoredName }) : null;
    render(<LocaleProvider preference={createMemoryLocalePreference("en")}><NameProbe value={subject} /><DisplayNameProvider resolver={resolver}><NameProbe value={subject} /></DisplayNameProvider></LocaleProvider>);

    expect(screen.getAllByRole("status").map((element) => element.textContent)).toEqual(["原创项目名称", "Reopen 原创项目名称"]);
  });
});
