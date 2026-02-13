import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";

// When STACK=true, start bound services as auxiliary workers in the same dev session.
// Usage: STACK=true pnpm dev:web  (or use root `pnpm dev:stack`)
const auxiliaryWorkers = process.env.STACK
  ? [
      { configPath: "../../services/data-layer/wrangler.jsonc" },
      { configPath: "../../services/content-scout/wrangler.jsonc" },
      { configPath: "../../services/publisher/wrangler.jsonc" },
    ]
  : [];

export default defineConfig({
  server: { port: 5173 },
  plugins: [
    cloudflare({
      persistState: { path: "../../.wrangler/shared-state" },
      auxiliaryWorkers,
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
