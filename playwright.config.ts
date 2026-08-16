import { defineConfig, devices } from "@playwright/test";
import { STORAGE_STATE } from "./e2e/helpers";

/**
 * Browser end-to-end tests.
 *
 * These exist for the things no other layer can reach: pointer-driven drag and
 * drop across an iframe boundary, resize handles, and whether the editor is
 * actually usable start to finish. Several real defects this project has
 * shipped — cross-realm `instanceof`, a covering overlay, a centred flex
 * container hiding content — were invisible to unit tests and obvious in a
 * browser.
 *
 * They run against the dev server on the app host, because host-based routing
 * is part of what is being tested.
 */
export default defineConfig({
  testDir: "./e2e",
  // The suites share one database, so they must not race each other.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],

  use: {
    baseURL: "http://app.localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Wide enough for the editor, which refuses to render below lg.
    viewport: { width: 1440, height: 900 },
  },

  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      dependencies: ["setup"],
    },
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
