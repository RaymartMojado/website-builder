import { z } from "zod";
import {
  DOCUMENT_VERSION,
  MAX_NODES,
  NODE_ID_PATTERN,
  type PageDocument,
} from "./types";
import { checkIntegrity } from "./operations";
import { getDef } from "@/components/registry";
import { findInvalidDeclarations } from "@/lib/styles/compile";

/**
 * Server-side document validation — OWASP A08.
 *
 * The client sends a JSON blob and asks us to store it. Every save is checked
 * in full: node types must exist in the registry, props must satisfy that
 * type's schema, the tree invariants must hold, and the whole thing must be
 * within size limits so nobody can DoS the renderer with a document.
 *
 * A failed document is REJECTED ENTIRELY. Partially applying a save would let
 * an attacker keep whichever parts passed.
 */

const styleObjectSchema = z.record(
  z.string().max(64),
  z.union([z.string().max(200), z.number()]),
);

const responsiveStyleSchema = z.object({
  base: styleObjectSchema,
  md: styleObjectSchema.optional(),
  lg: styleObjectSchema.optional(),
});

const nodeSchema = z.object({
  id: z.string().regex(NODE_ID_PATTERN, "Invalid node id"),
  type: z.string().min(1).max(64),
  props: z.record(z.string().max(64), z.unknown()),
  style: responsiveStyleSchema,
  children: z.array(z.string().regex(NODE_ID_PATTERN)).max(MAX_NODES),
  parent: z.string().regex(NODE_ID_PATTERN).nullable(),
});

const documentSchema = z.object({
  version: z.literal(DOCUMENT_VERSION),
  rootId: z.string().regex(NODE_ID_PATTERN),
  nodes: z.record(z.string().regex(NODE_ID_PATTERN), nodeSchema),
});

export type ValidationResult =
  | { ok: true; document: PageDocument }
  | { ok: false; errors: string[] };

export function validateDocument(input: unknown): ValidationResult {
  const parsed = documentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.slice(0, 10).map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    };
  }

  const doc = parsed.data as PageDocument;
  const errors: string[] = [];

  const nodeCount = Object.keys(doc.nodes).length;
  if (nodeCount > MAX_NODES) {
    errors.push(`Document has ${nodeCount} nodes, the limit is ${MAX_NODES}`);
  }

  // The map key must match the node's own id, or lookups and the tree
  // disagree about what a given id refers to.
  for (const [key, node] of Object.entries(doc.nodes)) {
    if (key !== node.id) errors.push(`Node key ${key} does not match its id ${node.id}`);
  }

  for (const node of Object.values(doc.nodes)) {
    const def = getDef(node.type);
    if (!def) {
      errors.push(`Unknown component type: ${node.type}`);
      continue;
    }

    const props = def.schema.safeParse(node.props);
    if (!props.success) {
      const first = props.error.issues[0];
      errors.push(`${node.type} (${node.id}): ${first?.path.join(".")} ${first?.message}`);
    }

    if (!def.acceptsChildren && node.children.length > 0) {
      errors.push(`${node.type} (${node.id}) cannot contain children`);
    }

    // Styles are checked by NAME and by VALUE. Checking only the property name
    // let `color: "red; } body { display:none } .x {"` through — the compiler
    // dropped it at render time, so it was never exploitable, but the stored
    // document then disagreed with what actually rendered. Refuse at the door.
    for (const breakpoint of ["base", "md", "lg"] as const) {
      const style = node.style[breakpoint];
      if (!style) continue;

      for (const problem of findInvalidDeclarations(style)) {
        errors.push(
          `${node.type} (${node.id}): style ${problem.property} at ${breakpoint} — ${problem.reason.replace("-", " ")}`,
        );
      }
    }
  }

  for (const problem of checkIntegrity(doc)) {
    errors.push(`${problem.kind} at ${problem.nodeId}${problem.detail ? ` (${problem.detail})` : ""}`);
  }

  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 20) };
  return { ok: true, document: doc };
}

/** Normalises props to their registry defaults, dropping unknown keys. */
export function sanitizeProps(type: string, props: Record<string, unknown>): Record<string, unknown> {
  const def = getDef(type);
  if (!def) return {};

  const parsed = def.schema.safeParse(props);
  return { ...def.defaultProps, ...(parsed.success ? parsed.data : {}) };
}
