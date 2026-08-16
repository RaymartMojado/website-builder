"use client";

import { useEditor } from "@/store/editor";
import type { Breakpoint, DocNode } from "@/lib/document/types";

/**
 * How wide the selected element should display.
 *
 * Typing "33%" into a width box assumes you already know that width is a
 * percentage of the parent, that % is a valid unit here, and that this is even
 * the property you want. The presets and the slider ask none of that — you
 * pick a size and see it.
 *
 * Percentages rather than pixels on purpose: a percentage keeps working when
 * the page is viewed narrower, which is what someone building a website almost
 * always wants and would not think to ask for.
 */

const PRESETS = [
  { label: "Small", value: 25 },
  { label: "Medium", value: 50 },
  { label: "Large", value: 75 },
  { label: "Full", value: 100 },
];

const MIN = 5;
const MAX = 100;

function effectiveWidth(node: DocNode, breakpoint: Breakpoint): string {
  const order: Breakpoint[] =
    breakpoint === "lg" ? ["lg", "md", "base"] : breakpoint === "md" ? ["md", "base"] : ["base"];

  for (const key of order) {
    const value = node.style[key]?.width;
    if (value !== undefined) return String(value);
  }
  return "";
}

/** The percentage a width string represents, or null if it is not a percentage. */
export function widthAsPercent(width: string): number | null {
  const match = /^(\d+(?:\.\d+)?)%$/.exec(width.trim());
  return match ? Number(match[1]) : null;
}

export function SizeControl({ node }: { node: DocNode }) {
  const breakpoint = useEditor((state) => state.breakpoint);

  const width = effectiveWidth(node, breakpoint);
  const percent = widthAsPercent(width);
  const isOwn = "width" in (node.style[breakpoint] ?? {});

  const set = (value: number) =>
    useEditor.getState().updateStyle(node.id, { width: `${Math.round(value)}%` });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-medium text-neutral-600">Size</span>
        <span className="font-mono text-[10.5px] text-neutral-400">
          {percent !== null ? `${Math.round(percent)}% wide` : width || "auto"}
        </span>
      </div>

      <div role="group" aria-label="Size presets" className="flex gap-1">
        {PRESETS.map((preset) => {
          const selected = percent !== null && Math.round(percent) === preset.value;
          return (
            <button
              key={preset.value}
              type="button"
              aria-pressed={selected}
              title={`${preset.label} — ${preset.value}% of the space available`}
              onClick={() => set(preset.value)}
              className={`flex flex-1 flex-col items-center gap-1 rounded border px-1 py-1.5 text-[10px] font-medium transition-colors ${
                selected
                  ? "border-blue-600 bg-blue-50 text-blue-800"
                  : "border-neutral-300 text-neutral-600 hover:border-neutral-400 hover:bg-neutral-50"
              }`}
            >
              {/* Each preset draws its own proportion, so the choice reads
                  without needing the number. */}
              <svg width="26" height="14" viewBox="0 0 26 14" aria-hidden="true">
                <rect x="0" y="0" width="26" height="14" rx="2" className="fill-neutral-200" />
                <rect
                  x="0"
                  y="0"
                  width={(26 * preset.value) / 100}
                  height="14"
                  rx="2"
                  fill="currentColor"
                />
              </svg>
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="range"
          aria-label="Width percentage"
          min={MIN}
          max={MAX}
          step={1}
          value={percent ?? 100}
          onChange={(event) => set(Number(event.target.value))}
          className="h-1 flex-1 cursor-pointer accent-blue-600"
        />
        <button
          type="button"
          title={isOwn ? "Reset — inherit from a smaller screen" : "Not set at this breakpoint"}
          aria-label="Reset size"
          disabled={!isOwn}
          onClick={() => useEditor.getState().updateStyle(node.id, { width: undefined })}
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            isOwn ? "bg-blue-600 hover:bg-red-500" : "bg-neutral-200"
          }`}
        />
      </div>

      {percent === null && width ? (
        <p className="text-[10.5px] leading-snug text-neutral-400">
          Currently set to {width}. Using a preset or the slider switches it to a percentage, so it
          scales on smaller screens.
        </p>
      ) : null}
    </div>
  );
}
