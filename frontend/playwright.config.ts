import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:15173",
    browserName: "chromium",
    locale: "ru-RU",
    // Linux Chromium uses LANGUAGE for native date controls, separately from context locale.
    launchOptions: { env: { ...process.env, LANGUAGE: "ru_RU:ru" } },
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    command: "corepack pnpm dev --port 15173",
    url: "http://localhost:15173",
    reuseExistingServer: false,
    env: { VITE_API_BASE_URL: "https://api.example.test/webhook" },
  },
});
