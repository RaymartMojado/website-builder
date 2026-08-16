"use client";

import { useCallback } from "react";
import * as icons from "lucide-react";
import { paletteGroupsFor, type ComponentDef } from "@/components/registry";
import { useEditor } from "@/store/editor";
import { hitTest, useDrag } from "@/store/drag";
import { getCanvasDocument, isOverCanvas, toFramePoint } from "./frame";

function Icon({ name }: { name: string }) {
  const Component = (icons as unknown as Record<string, icons.LucideIcon>)[name] ?? icons.Box;
  return <Component size={15} strokeWidth={1.75} aria-hidden="true" />;
}

/**
 * Component palette.
 *
 * Items can be dragged onto the canvas or clicked to insert. Click-to-insert
 * is not a fallback — it is the fast path once you know what you want, and it
 * is the only path that works without a pointer.
 */
export function Palette() {
  const insert = useEditor((state) => state.insert);
  // Nav and Logo belong in a shared region, not in a page body, so they only
  // appear when the header or footer is what you are editing.
  const editTarget = useEditor((state) => state.target);
  const groups = paletteGroupsFor(editTarget);

  /** Appends into the selected container, or the root. */
  const insertByClick = useCallback(
    (type: string) => {
      const { doc, selectedId } = useEditor.getState();
      const selected = selectedId ? doc.nodes[selectedId] : undefined;

      // Drop into the selection when it can hold children, otherwise beside it.
      const parentId =
        selected && requiresContainer(selected.type) ? selected.id : selected?.parent ?? doc.rootId;

      insert(type, {
        parentId,
        beforeId: selected && parentId === selected.parent ? nextSibling(doc, selected.id) : null,
      });
    },
    [insert],
  );

  const startDrag = useCallback((event: React.PointerEvent, type: string) => {
    if (event.button !== 0) return;
    event.preventDefault();

    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = false;

    const onMove = (moveEvent: PointerEvent) => {
      if (!dragging && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 4) return;

      if (!dragging) {
        dragging = true;
        useDrag.getState().begin({ kind: "new", type }, { x: moveEvent.clientX, y: moveEvent.clientY });
      }

      const pointer = { x: moveEvent.clientX, y: moveEvent.clientY };
      const frameDocument = getCanvasDocument();
      const local = toFramePoint(moveEvent.clientX, moveEvent.clientY);

      if (!frameDocument || !local || !isOverCanvas(moveEvent.clientX, moveEvent.clientY)) {
        useDrag.getState().update(null, pointer);
        return;
      }

      const target = hitTest({
        doc: useEditor.getState().doc,
        frameDocument,
        x: local.x,
        y: local.y,
        source: { kind: "new", type },
      });
      useDrag.getState().update(target, pointer);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);

      const { source, target } = useDrag.getState();
      if (dragging && source?.kind === "new" && target) {
        useEditor.getState().insert(source.type, target.position);
      }
      useDrag.getState().end();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  return (
    <div className="flex flex-col gap-5 p-3">
      {groups.map((group) => (
        <section key={group.category} className="flex flex-col gap-2">
          <h3 className="px-1 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-400">
            {group.label}
          </h3>
          <div className="grid grid-cols-2 gap-1.5">
            {group.items.map((definition) => (
              <PaletteItem
                key={definition.type}
                definition={definition}
                onClick={() => insertByClick(definition.type)}
                onPointerDown={(event) => startDrag(event, definition.type)}
              />
            ))}
          </div>
        </section>
      ))}
      <p className="px-1 text-[11px] leading-relaxed text-neutral-400">
        Drag onto the canvas, or click to add it inside whatever is selected.
      </p>
    </div>
  );
}

function PaletteItem({
  definition,
  onClick,
  onPointerDown,
}: {
  definition: ComponentDef;
  onClick: () => void;
  onPointerDown: (event: React.PointerEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={onPointerDown}
      // Suppress the browser's own drag-and-drop.
      //
      // Holding the button and moving lets Chromium start a native drag, which
      // enters a nested event loop and stops delivering pointermove to the
      // page entirely — the custom drag freezes after a single move, and it
      // looks like the editor has hung rather than like a browser default.
      draggable={false}
      onDragStart={(event) => event.preventDefault()}
      title={`Add ${definition.label}`}
      className="flex touch-none select-none items-center gap-2 rounded border border-neutral-200 bg-white px-2 py-2 text-left text-[12px] font-medium text-neutral-700 transition-colors hover:border-blue-400 hover:bg-blue-50/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 active:cursor-grabbing"
    >
      <span className="text-neutral-400">
        <Icon name={definition.icon} />
      </span>
      {definition.label}
    </button>
  );
}

function requiresContainer(type: string): boolean {
  return ["Root", "Section", "Container", "Columns"].includes(type);
}

function nextSibling(
  doc: ReturnType<typeof useEditor.getState>["doc"],
  nodeId: string,
): string | null {
  const parent = doc.nodes[nodeId]?.parent;
  if (!parent) return null;
  const siblings = doc.nodes[parent]!.children;
  return siblings[siblings.indexOf(nodeId) + 1] ?? null;
}

/** The ghost that follows the pointer during a palette drag. */
export function DragGhost() {
  const source = useDrag((state) => state.source);
  const pointer = useDrag((state) => state.pointer);

  if (!source || !pointer) return null;

  const label = source.kind === "new" ? source.type : "Moving";

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed z-50 rounded border border-blue-500 bg-white px-2 py-1 text-[11px] font-medium text-blue-700 shadow-md"
      style={{ left: pointer.x + 12, top: pointer.y + 12 }}
    >
      {label}
    </div>
  );
}
