import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
export default defineConfig({
  plugins: [react()],
  define: {
    __WIDGET_VERSION__: JSON.stringify(version),
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  esbuild: { minifyWhitespace: true },
  build: {
    outDir: "dist/widget",
    emptyOutDir: true,
    lib: {
      entry: "src/widget.tsx",
      formats: ["es"],
      fileName: () => "resolveai-studio.js",
      cssFileName: "resolveai-studio",
    },
  },
});
