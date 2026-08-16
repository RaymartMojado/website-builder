"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { applyPatches, enablePatches, produceWithPatches, type Patch } from "immer";
import type { Breakpoint, DocNode, NodeId, PageDocument } from "@/lib/document/types";
import { ancestorsOf } from "@/lib/document/types";
import {
  duplicateNode,
  insertNode,
  makeNode,
  moveNode,
  removeNode,
  setProps,
  setStyle,
  type InsertPosition,
} from "@/lib/document/operations";
import { getDef } from "@/components/registry";

enablePatches();

/**
 * Editor state.
 *
 * Undo/redo is patch-based and lands in the FIRST editor commit, not later.
 * Every mutation goes through `commit()`, which runs the operation inside an
 * Immer producer and records the forward and inverse patches. Retrofitting
 * this means auditing every mutation written in the meantime, and missing one
 * produces a history that silently corrupts documents.
 */

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

interface HistoryEntry {
  redo: Patch[];
  undo: Patch[];
  /** Consecutive edits of the same kind to the same node coalesce. */
  label: string;
}

const HISTORY_LIMIT = 100;

/** Typing into a text field should undo as a phrase, not a keystroke. */
const COALESCE_WINDOW_MS = 600;

/**
 * What the canvas is currently editing.
 *
 * The page body, or one of the site-wide shared regions. All three use the
 * same document format, so every operation works on any of them unchanged.
 */
export type EditTarget = "page" | "header" | "footer";

export const EDIT_TARGETS: { key: EditTarget; label: string }[] = [
  { key: "page", label: "Page" },
  { key: "header", label: "Header" },
  { key: "footer", label: "Footer" },
];

interface EditorState {
  /** The document currently being edited — always documents[target]. */
  doc: PageDocument;
  /** Every document the canvas composes, so the page renders in context. */
  documents: Record<EditTarget, PageDocument | null>;
  target: EditTarget;
  pageId: string;
  siteId: string;
  /** How many pages a shared-region edit affects. Drives the banner. */
  pageCount: number;
  /** Targets changed since load, so autosave knows what to send. */
  dirtyTargets: Set<EditTarget>;

  setTarget: (target: EditTarget) => void;

  selectedId: NodeId | null;
  hoveredId: NodeId | null;
  breakpoint: Breakpoint;
  previewMode: boolean;

  /** History is per target — see `histories`. These mirror the active one. */
  past: HistoryEntry[];
  future: HistoryEntry[];
  histories: Record<EditTarget, { past: HistoryEntry[]; future: HistoryEntry[] }>;
  lastCommit: { label: string; at: number } | null;

  saveState: SaveState;
  saveError: string | null;

  // selection
  select: (id: NodeId | null) => void;
  hover: (id: NodeId | null) => void;
  selectParent: () => void;
  setBreakpoint: (breakpoint: Breakpoint) => void;
  togglePreview: () => void;

  // mutations
  insert: (type: string, position: InsertPosition) => NodeId | null;
  move: (id: NodeId, position: InsertPosition) => void;
  remove: (id: NodeId) => void;
  duplicate: (id: NodeId) => void;
  updateProps: (id: NodeId, patch: Record<string, unknown>) => void;
  updateStyle: (id: NodeId, patch: Record<string, string | number | undefined>) => void;

  // history
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // persistence
  markSaving: () => void;
  markSaved: (savedTargets: EditTarget[]) => void;
  markError: (message: string) => void;
  reset: (input: {
    page: PageDocument;
    header: PageDocument | null;
    footer: PageDocument | null;
    pageId: string;
    siteId: string;
    pageCount: number;
  }) => void;
}

const emptyHistory = () => ({
  page: { past: [], future: [] },
  header: { past: [], future: [] },
  footer: { past: [], future: [] },
});

const EMPTY_DOC: PageDocument = { version: 1, rootId: "", nodes: {} };

export const useEditor = create<EditorState>((set, get) => ({
  doc: EMPTY_DOC,
  documents: { page: EMPTY_DOC, header: null, footer: null },
  target: "page",
  pageId: "",
  siteId: "",
  pageCount: 1,
  dirtyTargets: new Set<EditTarget>(),

  selectedId: null,
  hoveredId: null,
  // Desktop, not mobile. The editor is desktop-only and most people design the
  // wide layout first; opening at 390px made everything wrap and look cramped
  // before a single edit was made.
  breakpoint: "lg",
  previewMode: false,

  past: [],
  future: [],
  histories: emptyHistory(),
  lastCommit: null,

  saveState: "idle",
  saveError: null,

  /**
   * Switching target parks the current history and restores the new one, so
   * undo can never reach across from the page body into a shared region — an
   * undo that silently reverted a site-wide header change would be alarming.
   */
  setTarget: (target) => {
    const state = get();
    if (state.target === target) return;

    const document = state.documents[target];
    if (!document) return;

    const histories = {
      ...state.histories,
      [state.target]: { past: state.past, future: state.future },
    };

    set({
      target,
      doc: document,
      past: histories[target].past,
      future: histories[target].future,
      histories,
      selectedId: null,
      hoveredId: null,
      lastCommit: null,
    });
  },

  select: (id) => set({ selectedId: id }),
  hover: (id) => set({ hoveredId: id }),

  selectParent: () => {
    const { doc, selectedId } = get();
    if (!selectedId) return;
    const parent = ancestorsOf(doc, selectedId)[0];
    if (parent) set({ selectedId: parent.id });
  },

  setBreakpoint: (breakpoint) => set({ breakpoint }),
  togglePreview: () =>
    set((state) => ({ previewMode: !state.previewMode, selectedId: null, hoveredId: null })),

  insert: (type, position) => {
    const def = getDef(type);
    if (!def) return null;

    const node = makeNode(type, { ...def.defaultProps }, structuredClone(def.defaultStyle));
    commit(set, get, `insert:${node.id}`, (draft) => {
      insertNode(draft, node, position);
    });

    set({ selectedId: node.id });
    return node.id;
  },

  move: (id, position) => {
    commit(set, get, `move:${id}`, (draft) => {
      moveNode(draft, id, position);
    });
  },

  remove: (id) => {
    const { doc } = get();
    // Select the parent before the node disappears, so the inspector does not
    // blank out and the user keeps their place in the tree.
    const parent = ancestorsOf(doc, id)[0]?.id ?? null;

    commit(set, get, `remove:${id}`, (draft) => {
      removeNode(draft, id);
    });
    set({ selectedId: parent, hoveredId: null });
  },

  duplicate: (id) => {
    let copyId: NodeId | null = null;
    commit(set, get, `duplicate:${id}`, (draft) => {
      copyId = duplicateNode(draft, id);
    });
    if (copyId) set({ selectedId: copyId });
  },

  updateProps: (id, patch) => {
    // Coalesced: typing a word is one undo step, not one per character.
    commit(set, get, `props:${id}:${Object.keys(patch).join(",")}`, (draft) => {
      setProps(draft, id, patch);
    });
  },

  updateStyle: (id, patch) => {
    const { breakpoint } = get();
    commit(set, get, `style:${id}:${breakpoint}:${Object.keys(patch).join(",")}`, (draft) => {
      setStyle(draft, id, breakpoint, patch);
    });
  },

  undo: () => {
    const state = get();
    const entry = state.past[state.past.length - 1];
    if (!entry) return;

    const doc = applyPatches(state.doc, entry.undo);
    set({
      doc,
      documents: { ...state.documents, [state.target]: doc },
      dirtyTargets: new Set(state.dirtyTargets).add(state.target),
      past: state.past.slice(0, -1),
      future: [entry, ...state.future].slice(0, HISTORY_LIMIT),
      saveState: "dirty",
      lastCommit: null,
    });
  },

  redo: () => {
    const state = get();
    const entry = state.future[0];
    if (!entry) return;

    const doc = applyPatches(state.doc, entry.redo);
    set({
      doc,
      documents: { ...state.documents, [state.target]: doc },
      dirtyTargets: new Set(state.dirtyTargets).add(state.target),
      past: [...state.past, entry].slice(-HISTORY_LIMIT),
      future: state.future.slice(1),
      saveState: "dirty",
      lastCommit: null,
    });
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  markSaving: () => set({ saveState: "saving", saveError: null }),

  markSaved: (savedTargets) =>
    set((state) => {
      // Only clear the targets this save actually covered — an edit that
      // landed mid-flight must stay dirty or it is silently dropped.
      const remaining = new Set(state.dirtyTargets);
      for (const target of savedTargets) remaining.delete(target);

      return {
        dirtyTargets: remaining,
        saveState: remaining.size > 0 ? "dirty" : state.saveState === "saving" ? "saved" : state.saveState,
      };
    }),

  markError: (message) => set({ saveState: "error", saveError: message }),

  reset: ({ page, header, footer, pageId, siteId, pageCount }) =>
    set({
      doc: page,
      documents: { page, header, footer },
      target: "page",
      pageId,
      siteId,
      pageCount,
      dirtyTargets: new Set<EditTarget>(),
      selectedId: null,
      hoveredId: null,
      past: [],
      future: [],
      histories: emptyHistory(),
      lastCommit: null,
      saveState: "idle",
      saveError: null,
    }),
}));

/**
 * Runs a mutation and records its patches.
 *
 * Consecutive commits with the same label inside COALESCE_WINDOW_MS merge into
 * the previous history entry, so a burst of typing or dragging a slider is one
 * undo step. The inverse patches are prepended, keeping the entry's undo path
 * correct back to where the burst started.
 */
function commit(
  set: (partial: Partial<EditorState>) => void,
  get: () => EditorState,
  label: string,
  mutate: (draft: PageDocument) => void,
): void {
  const state = get();
  const [next, redo, undo] = produceWithPatches(state.doc, mutate);

  if (redo.length === 0) return; // nothing changed

  const now = Date.now();
  const previous = state.past[state.past.length - 1];
  const shouldCoalesce =
    previous !== undefined &&
    state.lastCommit?.label === label &&
    now - state.lastCommit.at < COALESCE_WINDOW_MS;

  const past = shouldCoalesce
    ? [
        ...state.past.slice(0, -1),
        { label, redo: [...previous!.redo, ...redo], undo: [...undo, ...previous!.undo] },
      ]
    : [...state.past, { label, redo, undo }].slice(-HISTORY_LIMIT);

  set({
    doc: next,
    // Keep the composed view in step, so the canvas shows the edit whichever
    // target it belongs to.
    documents: { ...state.documents, [state.target]: next },
    dirtyTargets: new Set(state.dirtyTargets).add(state.target),
    past,
    future: [], // a new edit invalidates the redo branch
    lastCommit: { label, at: now },
    saveState: "dirty",
  });
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function useSelectedNode(): DocNode | null {
  return useEditor((state) => (state.selectedId ? state.doc.nodes[state.selectedId] ?? null : null));
}

/**
 * Derived state is computed with useMemo, NOT inside the selector.
 *
 * Zustand reads through useSyncExternalStore, which requires the snapshot to
 * be reference-stable between renders. A selector that builds a fresh array
 * returns a new reference every time, React sees the store as perpetually
 * changed, and it re-renders forever ("The result of getSnapshot should be
 * cached to avoid an infinite loop").
 *
 * So: select stable references, derive from them.
 */
export function useBreadcrumb(): DocNode[] {
  const doc = useEditor((state) => state.doc);
  const selectedId = useEditor((state) => state.selectedId);

  return useMemo(() => {
    if (!selectedId) return EMPTY_TRAIL;
    const node = doc.nodes[selectedId];
    if (!node) return EMPTY_TRAIL;
    return [...ancestorsOf(doc, selectedId).reverse(), node];
  }, [doc, selectedId]);
}

/** A single frozen instance, so the empty case is reference-stable too. */
const EMPTY_TRAIL: DocNode[] = [];
