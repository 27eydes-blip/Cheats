// Screenshot runs for the graphics remake (not part of the test lane).
import { defineConfig } from "@playwright/test";
import base from "../../playwright.config.js";
const want = ["iphone-small", "iphone-std", "iphone-large", "ipad-portrait"];
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: /remake\.spec\.js/,
  reporter: [["line"]],
  retries: 0,
  webServer: [{ ...base.webServer[0], cwd: new URL("../..", import.meta.url).pathname }],
  projects: base.projects.filter((p) => p.name.startsWith("chromium-") && want.includes(p.name.slice(9))),
});
