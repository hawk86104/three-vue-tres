import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@aethertwin/design-system/tokens.css";
import "@aethertwin/design-system/base.css";
import { PlayerBoundary } from "./player-boundary";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Player root element is missing.");
}

createRoot(root).render(
  <StrictMode>
    <PlayerBoundary />
  </StrictMode>,
);
