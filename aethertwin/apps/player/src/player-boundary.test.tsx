// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { PlayerBoundary } from "./player-boundary";

it("does not claim M4 visitor capabilities", () => {
  render(<PlayerBoundary />);
  expect(screen.getByRole("heading", { name: "AetherTwin Player" })).toBeVisible();
  expect(screen.getByText("访客播放器将在 M4 启用")).toBeVisible();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
