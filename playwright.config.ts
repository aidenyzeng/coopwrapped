import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, channel: "chrome", acceptDownloads: true },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 860 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], channel: "chrome" } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    port: PORT,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
