import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5174", trace: "retain-on-failure" },
  webServer: [
    { command: "node ../server/test/start-browser-api.js", url: "http://127.0.0.1:5051/api/health", timeout: 120000 },
    { command: "npm run dev -- --host 127.0.0.1 --port 5174 --strictPort", url: "http://127.0.0.1:5174", env: { VITE_API_URL: "http://127.0.0.1:5051/api" } }
  ]
});
