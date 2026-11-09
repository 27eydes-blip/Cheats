import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "off" },
  projects: [
    { name: "laptop", use: { ...devices["Desktop Chrome"] }, testIgnore: /device\.spec/ },
    { name: "devices", use: { ...devices["Desktop Chrome"] }, testMatch: /device\.spec/ },
  ],
  webServer: {
    // Requires `npx supabase start` and `npm run build` first.
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    env: { AI_PROVIDER: "mock", ALLOW_MOCK_AI: "true" },
    timeout: 60_000,
  },
});
