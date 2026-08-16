import {
  type DocNode,
  type NodeId,
  type PageDocument,
  type ResponsiveStyle,
  type StyleObject,
  type Breakpoint,
  createNodeId,
  emptyStyle,
  isDescendant,
} from "./types";

/**
 * Structural edits on the node map.
 *
 * Every function here is written to be run inside an Immer producer — they
 * mutate the draft in place and return void. That is what makes patch-based
 * undo/redo possible without hand-writing an inverse for each operation.
 *
 * They also maintain the tree invariants the renderer relies on:
 *   - every child id exists in `nodes`
 *   - `parent` and `children` always agree
 *   - no node is its own ancestor
 *   - the root has no parent and is never removed
 */

export interface InsertPosition {
  parentId: NodeId;
  /** Insert before this sibling; append when omitted or not found. */
  beforeId?: NodeId | null;
  index?: number;
}

function resolveIndex(parent: DocNode, position: InsertPosition): number {
  if (typeof position.index === "number") {
    return Math.max(0, Math.min(position.index, parent.children.length));
  }
  if (position.beforeId) {
    const at = parent.children.indexOf(position.beforeId);
    if (at !== -1) return at;
  }
  return parent.children.length;
}

/** Creates a detached node. Not attached to the document until insertNode. */
export function makeNode(
  type: string,
  props: Record<string, unknown> = {},
  style: ResponsiveStyle = emptyStyle(),
): DocNode {
  return { id: createNodeId(), type, props, style, children: [], parent: null };
}

export function createDocument(rootType = "Root"): PageDocument {
  const root = makeNode(rootType);
  return { version: 1, rootId: root.id, nodes: { [root.id]: root } };
}

export function insertNode(
  doc: PageDocument,
  node: DocNode,
  position: InsertPosition,
): NodeId | null {
  const parent = doc.nodes[position.parentId];
  if (!parent) return null;

  doc.nodes[node.id] = node;
  node.parent = parent.id;
  parent.children.splice(resolveIndex(parent, position), 0, node.id);
  return node.id;
}

/**
 * Reparent or reorder an existing node.
 *
 * Refuses to move a node into its own subtree — that would detach the whole
 * branch from the root and leave an unreachable cycle in the map.
 */
export function moveNode(doc: PageDocument, nodeId: NodeId, position: InsertPosition): boolean {
  const node = doc.nodes[nodeId];
  const nextParent = doc.nodes[position.parentId];

  if (!node || !nextParent) return false;
  if (nodeId === doc.rootId) return false;
  if (nodeId === position.parentId) return false;
  if (isDescendant(doc, nodeId, position.parentId)) return false;

  const currentParent = node.parent ? doc.nodes[node.parent] : undefined;
  const movingWithinParent = currentParent?.id === nextParent.id;

  // Compute the target index BEFORE detaching, then correct for the gap the
  // detach leaves behind. Doing it the other way round drops the node one
  // position short whenever it moves forwards inside its own parent.
  let index = resolveIndex(nextParent, position);
  if (movingWithinParent) {
    const from = nextParent.children.indexOf(nodeId);
    if (from !== -1 && from < index) index -= 1;
  }

  if (currentParent) {
    const at = currentParent.children.indexOf(nodeId);
    if (at !== -1) currentParent.children.splice(at, 1);
  }

  node.parent = nextParent.id;
  nextParent.children.splice(index, 0, nodeId);
  return true;
}

/** Removes a node and its entire subtree. The root cannot be removed. */
export function removeNode(doc: PageDocument, nodeId: NodeId): boolean {
  const node = doc.nodes[nodeId];
  if (!node || nodeId === doc.rootId) return false;

  const parent = node.parent ? doc.nodes[node.parent] : undefined;
  if (parent) {
    const at = parent.children.indexOf(nodeId);
    if (at !== -1) parent.children.splice(at, 1);
  }

  const doomed: NodeId[] = [nodeId];
  while (doomed.length > 0) {
    const id = doomed.pop()!;
    const target = doc.nodes[id];
    if (!target) continue;
    doomed.push(...target.children);
    delete doc.nodes[id];
  }
  return true;
}

/**
 * Deep clone via JSON round-trip.
 *
 * structuredClone cannot clone an Immer draft proxy, and these operations run
 * inside producers by design. A JSON round-trip is safe here precisely because
 * a PageDocument is JSON by definition — props and styles hold no dates,
 * maps, or functions.
 */
function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Deep-copies a subtree with fresh ids, inserted after the original. */
export function duplicateNode(doc: PageDocument, nodeId: NodeId): NodeId | null {
  const node = doc.nodes[nodeId];
  if (!node || nodeId === doc.rootId || !node.parent) return null;

  const parent = doc.nodes[node.parent];
  if (!parent) return null;

  const copySubtree = (sourceId: NodeId, parentId: NodeId | null): NodeId | null => {
    const source = doc.nodes[sourceId];
    if (!source) return null;

    const copy: DocNode = {
      id: createNodeId(),
      type: source.type,
      props: clonePlain(source.props),
      style: clonePlain(source.style),
      children: [],
      parent: parentId,
    };
    doc.nodes[copy.id] = copy;

    for (const childId of source.children) {
      const childCopy = copySubtree(childId, copy.id);
      if (childCopy) copy.children.push(childCopy);
    }
    return copy.id;
  };

  const copyId = copySubtree(nodeId, parent.id);
  if (!copyId) return null;

  parent.children.splice(parent.children.indexOf(nodeId) + 1, 0, copyId);
  return copyId;
}

export function setProps(
  doc: PageDocument,
  nodeId: NodeId,
  patch: Record<string, unknown>,
): boolean {
  const node = doc.nodes[nodeId];
  if (!node) return false;
  Object.assign(node.props, patch);
  return true;
}

/**
 * Writes style values at one breakpoint.
 *
 * `undefined` deletes a property rather than storing it, so "unset" and "set
 * to nothing" stay distinguishable — the compiler treats an absent property as
 * inherit-from-the-smaller-breakpoint.
 */
export function setStyle(
  doc: PageDocument,
  nodeId: NodeId,
  breakpoint: Breakpoint,
  patch: Record<string, string | number | undefined>,
): boolean {
  const node = doc.nodes[nodeId];
  if (!node) return false;

  const target: StyleObject = node.style[breakpoint] ?? {};

  for (const [property, value] of Object.entries(patch)) {
    if (value === undefined || value === "") delete target[property];
    else target[property] = value;
  }

  if (breakpoint === "base") node.style.base = target;
  else if (Object.keys(target).length === 0) delete node.style[breakpoint];
  else node.style[breakpoint] = target;

  return true;
}

// ---------------------------------------------------------------------------
// Invariants
// ---------------------------------------------------------------------------

export interface IntegrityProblem {
  kind: "orphan" | "missing-child" | "parent-mismatch" | "cycle" | "unreachable" | "missing-root";
  nodeId: NodeId;
  detail?: string;
}

/**
 * Checks the invariants the renderer assumes. Used by the tests and by the
 * server-side validator before any document is written.
 */
export function checkIntegrity(doc: PageDocument): IntegrityProblem[] {
  const problems: IntegrityProblem[] = [];

  if (!doc.nodes[doc.rootId]) {
    return [{ kind: "missing-root", nodeId: doc.rootId }];
  }

  if (doc.nodes[doc.rootId]!.parent !== null) {
    problems.push({ kind: "orphan", nodeId: doc.rootId, detail: "root must have no parent" });
  }

  for (const node of Object.values(doc.nodes)) {
    for (const childId of node.children) {
      const child = doc.nodes[childId];
      if (!child) {
        problems.push({ kind: "missing-child", nodeId: node.id, detail: childId });
        continue;
      }
      if (child.parent !== node.id) {
        problems.push({ kind: "parent-mismatch", nodeId: childId, detail: `parent=${child.parent}` });
      }
    }

    if (node.id !== doc.rootId) {
      if (!node.parent) {
        problems.push({ kind: "orphan", nodeId: node.id });
      } else if (!doc.nodes[node.parent]) {
        problems.push({ kind: "orphan", nodeId: node.id, detail: `parent ${node.parent} missing` });
      } else if (!doc.nodes[node.parent]!.children.includes(node.id)) {
        problems.push({
          kind: "parent-mismatch",
          nodeId: node.id,
          detail: "not listed in parent's children",
        });
      }
    }
  }

  // Reachability catches cycles that the pairwise checks above cannot: a ring
  // of nodes can be internally consistent yet detached from the root.
  const reachable = new Set<NodeId>();
  const stack = [doc.rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (reachable.has(id)) {
      problems.push({ kind: "cycle", nodeId: id });
      continue;
    }
    reachable.add(id);
    const node = doc.nodes[id];
    if (node) stack.push(...node.children);
  }

  for (const id of Object.keys(doc.nodes)) {
    if (!reachable.has(id)) problems.push({ kind: "unreachable", nodeId: id });
  }

  return problems;
}
