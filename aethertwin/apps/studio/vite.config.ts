import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [react()],
  define: {
    "import.meta.env.VITE_AETHERTWIN_WEB_DEMO": JSON.stringify(
      mode === "web-demo" ? "1" : "0",
    ),
  },
  build: { outDir: "dist", emptyOutDir: true },
}));
