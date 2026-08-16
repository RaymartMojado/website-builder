"use client";

import { useEditor } from "@/store/editor";
import { getDef } from "@/components/registry";
import type { Breakpoint, DocNode, PageDocument } from "@/lib/document/types";

/**
 * Whether the selected node's siblings stack or sit in a row.
 *
 * This control belongs to the PARENT, not the selection — but people reach for
 * it while looking at a child. The reliable way to discover that is to put
 * three images side by side, set each to 33% wide, and watch them stay
 * stacked: width does not control flow direction, and nothing on the image
 * itself ever will.
 *
 * Surfacing the parent's direction here means the fix is where the confusion
 * is, instead of requiring someone to work out which ancestor owns the layout
 * and go select it.
 */

/** Resolves a style value across breakpoints, smallest-first. */
function effective(node: DocNode, property: string, breakpoint: Breakpoint): string {
  const order: Breakpoint[] =
    breakpoint === "lg" ? ["lg", "md", "base"] : breakpoint === "md" ? ["md", "base"] : ["base"];

  for (const key of order) {
    const value = node.style[key]?.[property];
    if (value !== undefined) return String(value);
  }
  return "";
}

function parentOf(doc: PageDocument, node: DocNode): DocNode | undefined {
  return node.parent ? doc.nodes[node.parent] : undefined;
}

/**
 * The options show the arrangement rather than naming it.
 *
 * A word like "stacked" only means something once you already know what the
 * alternative looks like. A picture of three blocks in a column next to three
 * blocks in a row needs no vocabulary at all, and this panel is used by people
 * who do not write CSS.
 */
function ArrangementOption({
  label,
  selected,
  onClick,
  preview,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  preview: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`flex flex-1 flex-col items-center gap-1.5 rounded border px-2 py-2 text-[11px] font-medium transition-colors ${
        selected
          ? "border-blue-600 bg-blue-50 text-blue-800"
          : "border-neutral-300 text-neutral-600 hover:border-neutral-400 hover:bg-neutral-50"
      }`}
    >
      <span className={selected ? "text-blue-600" : "text-neutral-400"}>{preview}</span>
      {label}
    </button>
  );
}

/** Three blocks in a column, filling the width — what stacking looks like. */
function StackedPreview() {
  return (
    <svg width="42" height="30" viewBox="0 0 42 30" aria-hidden="true" fill="currentColor">
      <rect x="3" y="2" width="36" height="7" rx="1.5" />
      <rect x="3" y="11.5" width="36" height="7" rx="1.5" />
      <rect x="3" y="21" width="36" height="7" rx="1.5" />
    </svg>
  );
}

/** Three blocks in a row, sharing the width — what side by side looks like. */
function RowPreview() {
  return (
    <svg width="42" height="30" viewBox="0 0 42 30" aria-hidden="true" fill="currentColor">
      <rect x="3" y="2" width="10.6" height="26" rx="1.5" />
      <rect x="15.7" y="2" width="10.6" height="26" rx="1.5" />
      <rect x="28.4" y="2" width="10.6" height="26" rx="1.5" />
    </svg>
  );
}

export function ParentLayout({ node }: { node: DocNode }) {
  const doc = useEditor((state) => state.doc);
  const breakpoint = useEditor((state) => state.breakpoint);

  const parent = parentOf(doc, node);
  if (!parent) return null;

  // Only meaningful for a parent that lays its children out with flex, and
  // only when there is more than one child to arrange.
  const display = effective(parent, "display", breakpoint);
  if (!display.includes("flex")) return null;
  if (parent.children.length < 2) return null;

  // An unset flex-direction is `row` in CSS, but every container in this
  // registry ships as a column, so read the effective value rather than assume.
  const direction = effective(parent, "flexDirection", breakpoint) || "row";
  const isRow = direction.startsWith("row");

  const set = (value: "row" | "column") =>
    useEditor.getState().updateStyle(parent.id, { flexDirection: value });

  const parentLabel = getDef(parent.type)?.label ?? parent.type;

  return (
    <div className="flex flex-col gap-1.5 border-t border-neutral-200 px-3 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-400">
          Arrangement
        </span>
        <button
          type="button"
          onClick={() => useEditor.getState().select(parent.id)}
          className="text-[10.5px] text-neutral-400 underline underline-offset-2 hover:text-neutral-700"
        >
          set on {parentLabel}
        </button>
      </div>

      <div role="group" aria-label="Arrangement" className="flex gap-1.5">
        <ArrangementOption
          label="Stacked"
          selected={!isRow}
          onClick={() => set("column")}
          preview={<StackedPreview />}
        />
        <ArrangementOption
          label="Side by side"
          selected={isRow}
          onClick={() => set("row")}
          preview={<RowPreview />}
        />
      </div>

      <p className="text-[10.5px] leading-snug text-neutral-400">
        {isRow
          ? `The ${parent.children.length} items in this ${parentLabel} sit in a row.`
          : `Width alone will not place items side by side — this is what does.`}
      </p>
    </div>
  );
}
