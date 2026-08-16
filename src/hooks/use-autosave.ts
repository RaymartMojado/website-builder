"use client";

import { useEffect, useRef } from "react";
import { useEditor, type EditTarget } from "@/store/editor";
import type { PageDocument } from "@/lib/document/types";

/**
 * Debounced autosave across all three edit targets.
 *
 * Subscribes to the store directly rather than taking documents as props, so a
 * save is scheduled by an actual change rather than by a render.
 *
 * Only DIRTY targets are sent, and a target is cleared only once its own save
 * succeeds — an edit that lands mid-flight stays dirty rather than being
 * silently dropped.
 *
 * Failures retry with backoff and stay visible. In a product with no save
 * button the indicator is the trust mechanism; a silent drop is far worse than
 * a visible error.
 */

const DEBOUNCE_MS = 800;
const MAX_ATTEMPTS = 4;

interface Snapshot {
  targets: EditTarget[];
  page: PageDocument | null;
  header: PageDocument | null;
  footer: PageDocument | null;
}

export function useAutosave(pageId: string, siteId: string) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const queued = useRef(false);
  const attempts = useRef(0);

  useEffect(() => {
    function snapshot(): Snapshot | null {
      const { dirtyTargets, documents } = useEditor.getState();
      if (dirtyTargets.size === 0) return null;

      return {
        targets: [...dirtyTargets],
        page: dirtyTargets.has("page") ? documents.page : null,
        header: dirtyTargets.has("header") ? documents.header : null,
        footer: dirtyTargets.has("footer") ? documents.footer : null,
      };
    }

    async function flush() {
      if (inFlight.current) {
        queued.current = true;
        return;
      }

      const pending = snapshot();
      if (!pending) return;

      inFlight.current = true;
      useEditor.getState().markSaving();

      try {
        const requests: Promise<Response>[] = [];

        if (pending.page) {
          requests.push(
            fetch(`/api/pages/${pageId}/draft`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ document: pending.page }),
            }),
          );
        }

        if (pending.header || pending.footer) {
          requests.push(
            fetch(`/api/sites/${siteId}/regions`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...(pending.header ? { header: pending.header } : {}),
                ...(pending.footer ? { footer: pending.footer } : {}),
              }),
            }),
          );
        }

        const responses = await Promise.all(requests);

        for (const response of responses) {
          if (response.ok) continue;
          const body = (await response.json().catch(() => ({}))) as {
            error?: string;
            details?: string[];
          };
          throw new Error(body.details?.[0] ?? body.error ?? `Save failed (${response.status})`);
        }

        attempts.current = 0;
        useEditor.getState().markSaved(pending.targets);
      } catch (error) {
        attempts.current += 1;
        useEditor.getState().markError(
          error instanceof Error ? error.message : "Save failed",
        );

        if (attempts.current < MAX_ATTEMPTS) {
          setTimeout(() => void flush(), 1000 * 2 ** attempts.current);
        }
      } finally {
        inFlight.current = false;
        if (queued.current) {
          queued.current = false;
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => void flush(), DEBOUNCE_MS);
        }
      }
    }

    const unsubscribe = useEditor.subscribe((state, previous) => {
      if (state.dirtyTargets === previous.dirtyTargets && state.documents === previous.documents) {
        return;
      }
      if (state.dirtyTargets.size === 0) return;

      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [pageId, siteId]);

  // Best-effort save when the tab goes away. `keepalive` lets the request
  // outlive the page; a normal fetch would be cancelled on unload.
  useEffect(() => {
    const onHide = () => {
      const { dirtyTargets, documents } = useEditor.getState();
      if (dirtyTargets.size === 0) return;

      if (dirtyTargets.has("page") && documents.page) {
        void fetch(`/api/pages/${pageId}/draft`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ document: documents.page }),
          keepalive: true,
        });
      }

      if (dirtyTargets.has("header") || dirtyTargets.has("footer")) {
        void fetch(`/api/sites/${siteId}/regions`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(dirtyTargets.has("header") ? { header: documents.header } : {}),
            ...(dirtyTargets.has("footer") ? { footer: documents.footer } : {}),
          }),
          keepalive: true,
        });
      }
    };

    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [pageId, siteId]);
}
