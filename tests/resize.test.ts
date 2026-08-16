import { describe, expect, it } from "vitest";
import { widthPercentFrom } from "@/components/editor/resize-handles";
import { widthAsPercent } from "@/components/editor/size-control";

/**
 * Resize maths.
 *
 * Dragging produces pixels, but the value stored is a PERCENTAGE of the
 * parent. A pixel width silently stops fitting the moment the page is viewed
 * narrower, and someone dragging an image to size has no reason to expect
 * that — so the intent is preserved rather than the measurement.
 */

const box = { left: 100, top: 0, width: 200, height: 150 };

describe("drag to width percentage", () => {
  it("converts the pointer position into a share of the parent", () => {
    // Dragged to 400px from a left edge at 100 → 300px inside a 600px parent.
    expect(widthPercentFrom(400, box, 600)).toBe(50);
    expect(widthPercentFrom(700, box, 600)).toBe(100);
    expect(widthPercentFrom(250, box, 600)).toBe(25);
  });

  it("never exceeds the parent", () => {
    // Overshooting the parent would push the element out of its container.
    expect(widthPercentFrom(5000, box, 600)).toBe(100);
  });

  it("keeps a floor so the element cannot be dragged out of existence", () => {
    // At zero width there is nothing left to grab, and the selection would be
    // unrecoverable without the layer tree.
    expect(widthPercentFrom(100, box, 600)).toBe(5);
    expect(widthPercentFrom(-500, box, 600)).toBe(5);
  });

  it("returns whole numbers, so the stored value stays readable", () => {
    for (const x of [137, 219, 333, 481]) {
      const percent = widthPercentFrom(x, box, 600);
      expect(Number.isInteger(percent)).toBe(true);
    }
  });

  it("degrades safely when the parent has no measurable width", () => {
    // A parent mid-layout can measure zero; dividing by it would produce
    // Infinity and write a nonsense width.
    expect(widthPercentFrom(400, box, 0)).toBe(100);
    expect(widthPercentFrom(400, box, -10)).toBe(100);
  });

  it("produces a value the style compiler accepts", () => {
    const percent = widthPercentFrom(400, box, 600);
    expect(`${percent}%`).toMatch(/^\d+%$/);
  });
});

describe("reading an existing width", () => {
  it("recognises percentages", () => {
    expect(widthAsPercent("50%")).toBe(50);
    expect(widthAsPercent(" 33% ")).toBe(33);
    expect(widthAsPercent("12.5%")).toBe(12.5);
  });

  it("returns null for anything else, so the slider does not lie", () => {
    // A pixel or keyword width has no percentage to show; pretending otherwise
    // would move the slider to a position that does not match the element.
    for (const value of ["320px", "auto", "", "100", "50 %", "calc(50%)"]) {
      expect(widthAsPercent(value), value).toBeNull();
    }
  });
});
