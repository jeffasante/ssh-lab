import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { URL } from "node:url";

const serverUrl = process.env.VITE_SSH_LAB_SERVER_URL ?? "http://localhost:8080";
const httpTarget = serverUrl.replace(/^ws/, "http");
const wsTarget = serverUrl.replace(/^http/, "ws");

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      name: "internet-proxy",
      configureServer(server) {
        server.middlewares.use("/api/internet", async (req, res) => {
          try {
            const requestUrl = new URL(req.url ?? "", "http://localhost");
            const target = requestUrl.searchParams.get("url") ?? "";
            const parsedTarget = new URL(target);
            if (!["http:", "https:"].includes(parsedTarget.protocol)) {
              throw new Error("Only http and https URLs are supported");
            }

            const response = await fetch(parsedTarget.toString(), {
              headers: { "User-Agent": "ssh-lab-curl/1.0" },
            });
            const body = await response.text();
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                ok: response.ok,
                status: response.status,
                statusText: response.statusText,
                body,
              }),
            );
          } catch (error) {
            res.statusCode = 502;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                ok: false,
                error: error instanceof Error ? error.message : String(error),
              }),
            );
          }
        });
      },
    },
  ],
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
