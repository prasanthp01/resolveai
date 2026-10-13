import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => ({
  base: loadEnv(mode, process.cwd(), "").VITE_APP_BASE || "/",
  plugins: [react()],
  server: {
    port: 5179,
    proxy: {
      "/api/projects/resolveai": "http://127.0.0.1:8131",
      "/api": "http://127.0.0.1:8130",
      "/health": "http://127.0.0.1:8130",
    },
  },
}));
