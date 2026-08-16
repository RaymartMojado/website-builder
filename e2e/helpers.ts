import { expect, type Page, type FrameLocator, type Locator } from "@playwright/test";

/**
 * Shared helpers.
 *
 * The canvas is an iframe, so almost every editor assertion needs a frame
 * locator rather than a page locator. Wrapping that here keeps the specs about
 * behaviour instead of plumbing.
 */

export const DEMO = { email: "demo@example.test", password: "demo-password-123" };

export const SITES_HOST = "sites.localhost:3000";

/** Session captured once by auth.setup.ts and reused by every spec. */
export const STORAGE_STATE = "e2e/.auth/state.json";

/** Opens the editor for the first page of the named site. */
export async function openEditor(page: Page, siteName: string): Promise<void> {
  await page.goto("/dashboard");

  const card = page.locator("li").filter({ has: page.getByRole("heading", { name: siteName }) });
  await card.getByRole("link").filter({ hasText: "Home" }).first().click();

  await page.waitForURL("**/dashboard/editor/**");
  await expect(canvas(page).locator("[data-node-id]").first()).toBeVisible();
}

export function canvas(page: Page): FrameLocator {
  return page.frameLocator('iframe[title="Page canvas"]');
}

/** A node in the canvas, by component type. */
export function node(page: Page, type: string, index = 0): Locator {
  return canvas(page).locator(`[data-node-type="${type}"]`).nth(index);
}

/** The right-hand inspector panel. */
export function inspector(page: Page): Locator {
  return page.locator("aside").last();
}

/**
 * Selects a canvas node and waits for the inspector to show THAT node.
 *
 * Asserting on the component name rather than "some text appeared" matters:
 * the inspector always renders something, so a weaker wait lets a mis-targeted
 * click sail through and fail later somewhere confusing.
 */
export async function select(page: Page, type: string, index = 0): Promise<void> {
  await node(page, type, index).click({ force: true });
  await expect(inspector(page).getByRole("heading", { level: 2 })).toHaveText(labelFor(type));
}

/** Registry labels differ from type names for a few components. */
function labelFor(type: string): string {
  const labels: Record<string, string> = {
    Nav: "Navigation",
    Root: "Page",
  };
  return labels[type] ?? type;
}

/** The live URL for a published site. */
export function publishedUrl(subdomain: string, path = "/"): string {
  return `http://${subdomain}.${SITES_HOST}${path}`;
}

/** Waits for autosave to settle, so a reload assertion is not racing it. */
export async function waitForSaved(page: Page): Promise<void> {
  await expect(page.getByText("All changes saved")).toBeVisible({ timeout: 15_000 });
}
