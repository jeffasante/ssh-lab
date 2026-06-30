import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const serverUrl = process.env.VITE_SSH_LAB_SERVER_URL ?? "http://localhost:8080";
const httpTarget = serverUrl.replace(/^ws/, "http");
const wsTarget = serverUrl.replace(/^http/, "ws");

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
    proxy: {
      "/ws": {
        target: wsTarget,
        ws: true,
      },
      "/api/": {
        target: httpTarget,
      },
    },
  },
});
