import { test as setup, expect } from "@playwright/test";
import { DEMO, STORAGE_STATE } from "./helpers";

/**
 * Signs in once and saves the session for every other spec.
 *
 * Not just a speed optimisation: signing in per test tripped the auth rate
 * limiter part-way through the suite, and the resulting failures looked like
 * editor bugs rather than what they were. Real users do not re-authenticate
 * between actions either, so this is also the more faithful shape.
 */
setup("authenticate", async ({ page }) => {
  await page.goto("/signin");
  await page.getByLabel("Email").fill(DEMO.email);
  await page.getByLabel("Password").fill(DEMO.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { name: "Your sites" })).toBeVisible();

  await page.context().storageState({ path: STORAGE_STATE });
});
