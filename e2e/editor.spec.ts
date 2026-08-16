import { expect, test } from "@playwright/test";
import { canvas, inspector, node, openEditor, select, waitForSaved } from "./helpers";

/**
 * The editor, driven the way a person drives it.
 *
 * This is the layer that catches what unit tests cannot: pointer drags across
 * the iframe boundary, whether a click actually selects, and whether anything
 * is visible at all.
 */

test.beforeEach(async ({ page }) => {
  await openEditor(page, "Acme Coffee");
});

test("the page renders inside the canvas", async ({ page }) => {
  await expect(node(page, "Heading")).toBeVisible();
  await expect(canvas(page).locator('[data-region="page"]')).toBeVisible();
});

test("the site header is visible while editing a page", async ({ page }) => {
  // It was once covered by a full-bleed overlay, which made the nav invisible
  // and the header look broken.
  const nav = node(page, "Nav");
  await expect(nav).toBeVisible();
  await expect(nav.locator("[data-nav-item]").first()).toBeVisible();

  const box = await nav.boundingBox();
  expect(box, "nav must occupy real space").not.toBeNull();
  expect(box!.height).toBeGreaterThan(0);
});

test("the header stays a compact single row", async ({ page }) => {
  const header = node(page, "Header");
  const box = await header.boundingBox();

  // A nav bar should read as chrome. Wrapping put the logo on one line and the
  // links on the next, doubling the height.
  expect(box!.height).toBeLessThan(80);
});

test("nav links sit side by side, not stacked", async ({ page }) => {
  const items = node(page, "Nav").locator("[data-nav-item]");
  await expect(items).toHaveCount(2);

  const first = await items.nth(0).boundingBox();
  const second = await items.nth(1).boundingBox();

  // Same row: their vertical centres line up and the second is to the right.
  expect(Math.abs(first!.y - second!.y)).toBeLessThan(4);
  expect(second!.x).toBeGreaterThan(first!.x);
});

test("clicking an element selects it and fills the inspector", async ({ page }) => {
  await select(page, "Heading");

  await expect(inspector(page)).toContainText("Heading");
  await expect(inspector(page).getByLabel("Text", { exact: true })).toBeVisible();
});

test("editing text in the inspector updates the canvas", async ({ page }) => {
  await select(page, "Heading");

  const field = inspector(page).getByLabel("Text", { exact: true });
  await field.fill("Edited in a real browser");

  await expect(node(page, "Heading")).toHaveText("Edited in a real browser");
});

test("undo reverses an edit", async ({ page }) => {
  await select(page, "Heading");
  const original = await node(page, "Heading").textContent();

  await inspector(page).getByLabel("Text", { exact: true }).fill("Temporary");
  await expect(node(page, "Heading")).toHaveText("Temporary");

  await page.getByTitle("Undo (Ctrl+Z)").click();
  await expect(node(page, "Heading")).toHaveText(original!);
});

test("a component can be added by clicking the palette", async ({ page }) => {
  const before = await canvas(page).locator('[data-node-type="Button"]').count();

  // Selected via the Layers panel, not the canvas: a Container's centre is
  // covered by its own children, so clicking it there hits a child instead.
  // This is exactly the case the layer tree exists for.
  await page.getByRole("tab", { name: "Layers" }).click();
  await page.getByRole("button", { name: /^Container/ }).first().click();
  await expect(inspector(page).getByRole("heading", { level: 2 })).toHaveText("Container");

  await page.getByRole("tab", { name: "Components" }).click();
  await page.getByTitle("Add Button").click();

  await expect(canvas(page).locator('[data-node-type="Button"]')).toHaveCount(before + 1);
});

test("a component can be dragged from the palette onto the canvas", async ({ page }) => {
  const before = await canvas(page).locator('[data-node-type="Divider"]').count();

  const from = (await page.getByTitle("Add Divider").boundingBox())!;
  const to = (await node(page, "Heading").boundingBox())!;

  /*
   * Driven with real PointerEvents rather than page.mouse.
   *
   * Playwright's mouse dispatch stalls indefinitely once a button is held and
   * the pointer is over an iframe — verified against a responsive main thread,
   * so it is the harness and not the app. Dispatching the same events the
   * browser would still exercises the whole path: begin → hit-test → drop
   * indicator → insert.
   */
  await page.evaluate(
    async ([start, path]) => {
      const fire = (type: string, x: number, y: number, target: EventTarget) =>
        target.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            button: 0,
            buttons: type === "pointerup" ? 0 : 1,
            pointerId: 1,
            isPrimary: true,
          }),
        );

      const button = document
        .elementFromPoint(start.x, start.y)
        ?.closest("button");
      if (!button) throw new Error("palette button not found at start point");

      fire("pointerdown", start.x, start.y, button);
      for (const point of path) {
        fire("pointermove", point.x, point.y, window);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      fire("pointerup", path[path.length - 1]!.x, path[path.length - 1]!.y, window);
    },
    [
      { x: from.x + from.width / 2, y: from.y + from.height / 2 },
      [
        { x: from.x + 40, y: from.y + 20 },
        { x: to.x + to.width / 2, y: to.y + 4 },
        { x: to.x + to.width / 2, y: to.y + 8 },
      ],
    ] as const,
  );

  await expect(canvas(page).locator('[data-node-type="Divider"]')).toHaveCount(before + 1);
});

test("changes are saved and survive a reload", async ({ page }) => {
  await select(page, "Heading");
  const text = `Persisted ${Date.now()}`;
  await inspector(page).getByLabel("Text", { exact: true }).fill(text);

  await waitForSaved(page);
  await page.reload();

  await expect(node(page, "Heading")).toHaveText(text);
});

test("switching breakpoint keeps the content visible", async ({ page }) => {
  for (const label of ["Tablet", "Mobile", "Desktop"]) {
    await page.getByRole("button", { name: label, exact: true }).click();

    // Content vanishing here was a real bug: a centred flex container stranded
    // the overflow where it could not be scrolled to.
    await expect(node(page, "Heading")).toBeVisible();
    const box = await node(page, "Heading").boundingBox();
    expect(box!.width, `${label} must show content`).toBeGreaterThan(0);
  }
});

test("preview mode hides the editor chrome", async ({ page }) => {
  await select(page, "Heading");
  await page.getByRole("button", { name: "Preview" }).click();

  // The selection outline is editor chrome and must not appear in preview.
  const outline = await node(page, "Heading").evaluate(
    (el) => getComputedStyle(el).outlineStyle,
  );
  expect(outline).toBe("none");
});
