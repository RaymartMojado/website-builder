import { Fragment } from "react";
import type { NodeId, PageDocument } from "@/lib/document/types";
import { MAX_DEPTH } from "@/lib/document/types";
import { nodeClass } from "@/lib/styles/compile";
import { getDef } from "@/components/registry";
import type { RenderContext } from "@/components/blocks";

/**
 * Recursive renderer.
 *
 * A pure function of (document, context) — no hooks, no state — so the same
 * component tree runs as a React Server Component on a published page and
 * inside the editor's iframe.
 *
 * Unknown node types render nothing rather than throwing. A document saved by
 * a newer client must not blank out a live site.
 */

export function RenderNode({
  doc,
  nodeId,
  ctx,
  depth = 0,
}: {
  doc: PageDocument;
  nodeId: NodeId;
  ctx: RenderContext;
  depth?: number;
}) {
  if (depth > MAX_DEPTH) return null;

  const node = doc.nodes[nodeId];
  if (!node) return null;

  const def = getDef(node.type);
  if (!def) return null;

  const children = node.children.map((childId) => (
    <RenderNode key={childId} doc={doc} nodeId={childId} ctx={ctx} depth={depth + 1} />
  ));

  const Component = def.render;

  return (
    <Component
      props={node.props}
      attrs={{
        className: nodeClass(node.id),
        "data-node-id": node.id,
        "data-node-type": node.type,
      }}
      ctx={ctx}
      isEmpty={def.acceptsChildren && node.children.length === 0}
    >
      {children}
    </Component>
  );
}

/**
 * Renders a full page: header, body, footer.
 *
 * The composition lives here rather than in the page route so the editor and
 * the published renderer produce the same tree. Phase 4 adds the UI for
 * editing the shared regions; the seam is already load-bearing.
 */
export function RenderPage({
  body,
  header,
  footer,
  ctx,
}: {
  body: PageDocument;
  header?: PageDocument | null;
  footer?: PageDocument | null;
  ctx: RenderContext;
}) {
  return (
    <Fragment>
      {header ? <RenderNode doc={header} nodeId={header.rootId} ctx={ctx} /> : null}
      <RenderNode doc={body} nodeId={body.rootId} ctx={ctx} />
      {footer ? <RenderNode doc={footer} nodeId={footer.rootId} ctx={ctx} /> : null}
    </Fragment>
  );
}
