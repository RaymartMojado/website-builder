"use client";

import { useMemo, useState } from "react";
import * as icons from "lucide-react";
import { useEditor } from "@/store/editor";
import { getDef, canAcceptChild } from "@/components/registry";
import type { DocNode, PageDocument } from "@/lib/document/types";

/**
 * Layer tree.
 *
 * Two jobs beyond navigation:
 *
 *   1. The escape hatch for nodes that are hard or impossible to click — a
 *      zero-height spacer, an element behind another, an empty container.
 *
 *   2. The keyboard alternative to dragging, which WCAG 2.5.7 requires. Move
 *      up / move down / move into the previous sibling, all from the keyboard,
 *      reaching every arrangement a drag can produce.
 */
export function LayerTree() {
  const doc = useEditor((state) => state.doc);
  const selectedId = useEditor((state) => state.selectedId);

  const headingProblems = useMemo(() => findHeadingProblems(doc), [doc]);

  if (!doc.nodes[doc.rootId]) return null;

  return (
    <div className="flex flex-col gap-2 p-2">
      <TreeRow doc={doc} nodeId={doc.rootId} depth={0} selectedId={selectedId} problems={headingProblems} />

      {headingProblems.size > 0 ? (
        <p className="mx-1 rounded bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-900">
          Heading levels skip a step. Screen reader users navigate by these, so going h2 → h4 hides
          structure.
        </p>
      ) : null}
    </div>
  );
}

function TreeRow({
  doc,
  nodeId,
  depth,
  selectedId,
  problems,
}: {
  doc: PageDocument;
  nodeId: string;
  depth: number;
  selectedId: string | null;
  problems: Set<string>;
}) {
  const node = doc.nodes[nodeId];
  const [collapsed, setCollapsed] = useState(false);

  if (!node) return null;

  const def = getDef(node.type);
  const isSelected = selectedId === nodeId;
  const isRoot = nodeId === doc.rootId;

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded pr-1 ${
          isSelected ? "bg-blue-600 text-white" : "text-neutral-700 hover:bg-neutral-100"
        }`}
        style={{ paddingLeft: depth * 12 }}
      >
        {node.children.length > 0 ? (
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "Expand" : "Collapse"}
            className="shrink-0 p-0.5 opacity-60 hover:opacity-100"
          >
            <icons.ChevronRight
              size={12}
              style={{ transform: collapsed ? undefined : "rotate(90deg)" }}
            />
          </button>
        ) : (
          <span className="w-[17px] shrink-0" />
        )}

        <button
          type="button"
          onClick={() => useEditor.getState().select(nodeId)}
          onMouseEnter={() => useEditor.getState().hover(nodeId)}
          onMouseLeave={() => useEditor.getState().hover(null)}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-[12px]"
        >
          <span className={isSelected ? "text-white/70" : "text-neutral-400"}>
            <LayerIcon name={def?.icon ?? "Box"} />
          </span>
          <span className="truncate">{labelFor(node)}</span>
          {problems.has(nodeId) ? (
            <span title="Heading level skipped" className="text-amber-500">
              <icons.TriangleAlert size={11} />
            </span>
          ) : null}
        </button>

        {!isRoot ? <MoveControls doc={doc} nodeId={nodeId} isSelected={isSelected} /> : null}
      </div>

      {!collapsed
        ? node.children.map((childId) => (
            <TreeRow
              key={childId}
              doc={doc}
              nodeId={childId}
              depth={depth + 1}
              selectedId={selectedId}
              problems={problems}
            />
          ))
        : null}
    </div>
  );
}

/**
 * The keyboard path to every arrangement a drag can reach: reorder among
 * siblings, and nest into the sibling above.
 */
function MoveControls({
  doc,
  nodeId,
  isSelected,
}: {
  doc: PageDocument;
  nodeId: string;
  isSelected: boolean;
}) {
  const node = doc.nodes[nodeId]!;
  const parent = node.parent ? doc.nodes[node.parent] : undefined;
  if (!parent) return null;

  const index = parent.children.indexOf(nodeId);
  const previousId = parent.children[index - 1];
  const previous = previousId ? doc.nodes[previousId] : undefined;

  const canNest = previous ? canAcceptChild(previous.type, node.type) : false;
  const grandparent = parent.parent ? doc.nodes[parent.parent] : undefined;

  const buttonClass = `rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-60 focus-visible:opacity-100 hover:!opacity-100 disabled:!opacity-20 ${
    isSelected ? "hover:bg-white/20" : "hover:bg-neutral-200"
  }`;

  return (
    <span className="flex shrink-0 items-center">
      <button
        type="button"
        title="Move up"
        disabled={index <= 0}
        onClick={() =>
          useEditor.getState().move(nodeId, { parentId: parent.id, index: index - 1 })
        }
        className={buttonClass}
      >
        <icons.ChevronUp size={12} />
      </button>
      <button
        type="button"
        title="Move down"
        disabled={index >= parent.children.length - 1}
        onClick={() =>
          useEditor.getState().move(nodeId, { parentId: parent.id, index: index + 2 })
        }
        className={buttonClass}
      >
        <icons.ChevronDown size={12} />
      </button>
      <button
        type="button"
        title={canNest ? `Move into ${labelFor(previous!)}` : "Nothing above to nest into"}
        disabled={!canNest}
        onClick={() => useEditor.getState().move(nodeId, { parentId: previousId! })}
        className={buttonClass}
      >
        <icons.IndentIncrease size={12} />
      </button>
      <button
        type="button"
        title="Move out"
        disabled={!grandparent}
        onClick={() =>
          useEditor.getState().move(nodeId, {
            parentId: grandparent!.id,
            index: grandparent!.children.indexOf(parent.id) + 1,
          })
        }
        className={buttonClass}
      >
        <icons.IndentDecrease size={12} />
      </button>
    </span>
  );
}

function LayerIcon({ name }: { name: string }) {
  const Component = (icons as unknown as Record<string, icons.LucideIcon>)[name] ?? icons.Box;
  return <Component size={13} strokeWidth={1.75} aria-hidden="true" />;
}

function labelFor(node: DocNode): string {
  const def = getDef(node.type);
  const text = typeof node.props.text === "string" ? node.props.text : "";
  const label = typeof node.props.label === "string" ? node.props.label : "";
  const detail = (text || label).trim();

  if (detail) return `${def?.label ?? node.type} · ${detail.slice(0, 22)}`;
  return def?.label ?? node.type;
}

/**
 * Flags headings that skip a level (h2 → h4). Assistive technology builds its
 * document outline from these, so a skip removes a rung from the ladder.
 */
function findHeadingProblems(doc: PageDocument): Set<string> {
  const problems = new Set<string>();
  let previous = 0;

  const visit = (nodeId: string) => {
    const node = doc.nodes[nodeId];
    if (!node) return;

    if (node.type === "Heading") {
      const level = Number(String(node.props.level ?? "h2").replace("h", "")) || 2;
      if (previous > 0 && level > previous + 1) problems.add(nodeId);
      previous = level;
    }

    for (const childId of node.children) visit(childId);
  };

  visit(doc.rootId);
  return problems;
}
