import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./app.css";
import { StudioRoot } from "./studio-root";

const root = document.getElementById("root");

if (root === null) {
  throw new Error("Studio root element is missing");
}

createRoot(root).render(
  <StrictMode>
    <StudioRoot />
  </StrictMode>,
);
