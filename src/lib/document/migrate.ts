import { DOCUMENT_VERSION, type PageDocument } from "./types";
import { createDocument } from "./operations";

/**
 * Document migration.
 *
 * A no-op today, and that is the point: it exists before it is needed, so the
 * first format change is a function body rather than an archaeology exercise
 * across every stored document.
 *
 * Every read path goes through here. When version 2 arrives, add a case that
 * upgrades 1 → 2 and published sites keep rendering without a backfill.
 */

export function migrate(input: unknown): PageDocument {
  if (!input || typeof input !== "object") return createDocument();

  const candidate = input as Partial<PageDocument> & { version?: number };

  switch (candidate.version) {
    case DOCUMENT_VERSION:
      return candidate as PageDocument;

    // case 1: return upgradeV1ToV2(candidate)

    default:
      // Unrecognised or missing version. Returning an empty document is the
      // safe failure: a blank page is recoverable, a half-interpreted one is
      // not.
      return createDocument();
  }
}

export function isDocument(value: unknown): value is PageDocument {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PageDocument>;
  return (
    candidate.version === DOCUMENT_VERSION &&
    typeof candidate.rootId === "string" &&
    typeof candidate.nodes === "object" &&
    candidate.nodes !== null
  );
}
