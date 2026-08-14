// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioRoot } from "./studio-root";

vi.mock("./app", () => ({
  App: () => <div data-testid="ordinary-app" />,
}));

vi.mock("./web-demo/web-demo-app", () => ({
  WebDemoApp: () => <div data-testid="web-demo" />,
}));

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
});
