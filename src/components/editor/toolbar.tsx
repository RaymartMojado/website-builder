"use client";

import { useActionState } from "react";
import Link from "next/link";
import * as icons from "lucide-react";
import { BREAKPOINTS } from "@/lib/document/types";
import { EDIT_TARGETS, useEditor } from "@/store/editor";
import { publishedUrl } from "@/lib/sites/subdomain";
import { useEditorSite } from "./site-context";
import { publishPageAction, type PageActionState } from "@/app/dashboard/pages/actions";

const EMPTY: PageActionState = {};

export function Toolbar({ pageId, pageTitle }: { pageId: string; pageTitle: string }) {
  const site = useEditorSite();
  const breakpoint = useEditor((state) => state.breakpoint);
  const previewMode = useEditor((state) => state.previewMode);
  const canUndo = useEditor((state) => state.past.length > 0);
  const canRedo = useEditor((state) => state.future.length > 0);
  const editTarget = useEditor((state) => state.target);
  const documents = useEditor((state) => state.documents);

  const available = {
    page: true,
    header: documents.header !== null,
    footer: documents.footer !== null,
  };

  const [publishState, publish, publishing] = useActionState(publishPageAction, EMPTY);

  return (
    <header className="flex flex-wrap items-center gap-2.5 border-b border-neutral-200 bg-white px-3 py-1.5">
      <Link
        href="/dashboard"
        className="flex items-center gap-1 rounded px-1.5 py-1 text-[12px] text-neutral-500 hover:bg-neutral-100"
      >
        <icons.ChevronLeft size={13} />
        {site.name}
      </Link>

      <span className="text-[13px] font-semibold">{pageTitle}</span>

      {/* What the canvas is editing. The header and footer are site-wide, so
          this is also where you go to change the nav and logo. */}
      <div
        role="group"
        aria-label="Edit target"
        className="flex items-center rounded border border-neutral-200 p-0.5"
      >
        {EDIT_TARGETS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            aria-pressed={editTarget === entry.key}
            disabled={!available[entry.key]}
            title={
              available[entry.key]
                ? entry.key === "page"
                  ? "Edit this page"
                  : `Edit the site ${entry.key} — applies to every page`
                : `This site has no ${entry.key} yet`
            }
            onClick={() => useEditor.getState().setTarget(entry.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-30 ${
              editTarget === entry.key
                ? "bg-blue-600 text-white"
                : "text-neutral-500 hover:bg-neutral-100"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-0.5">
        <ToolButton
          title="Undo (Ctrl+Z)"
          disabled={!canUndo}
          onClick={() => useEditor.getState().undo()}
          icon={<icons.Undo2 size={14} />}
        />
        <ToolButton
          title="Redo (Ctrl+Shift+Z)"
          disabled={!canRedo}
          onClick={() => useEditor.getState().redo()}
          icon={<icons.Redo2 size={14} />}
        />
      </div>

      {/* Breakpoint switcher — resizes the iframe, so media queries respond
          for real rather than being simulated. */}
      <div
        role="group"
        aria-label="Preview width"
        className="flex items-center rounded border border-neutral-200 p-0.5"
      >
        {BREAKPOINTS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            aria-pressed={breakpoint === entry.key}
            onClick={() => useEditor.getState().setBreakpoint(entry.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
              breakpoint === entry.key
                ? "bg-neutral-900 text-white"
                : "text-neutral-500 hover:bg-neutral-100"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <SaveIndicator />

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => useEditor.getState().togglePreview()}
          aria-pressed={previewMode}
          className={`flex items-center gap-1.5 rounded border px-2 py-1.5 text-[12px] font-medium transition-colors ${
            previewMode
              ? "border-neutral-900 bg-neutral-900 text-white"
              : "border-neutral-300 text-neutral-700 hover:bg-neutral-100"
          }`}
        >
          <icons.Eye size={13} />
          Preview
        </button>

        {/* Icon only — the label pushed this row past the available width and
            wrapped the whole toolbar onto two lines, stealing canvas height. */}
        <a
          href={publishedUrl(site.subdomain)}
          target="_blank"
          rel="noopener noreferrer"
          title="View the live site"
          aria-label="View the live site"
          className="rounded border border-neutral-300 p-1.5 text-neutral-700 hover:bg-neutral-100"
        >
          <icons.ExternalLink size={13} />
        </a>

        <form action={publish}>
          <input type="hidden" name="pageId" value={pageId} />
          <button
            type="submit"
            disabled={publishing}
            className="rounded bg-blue-600 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
          >
            {publishing ? "Publishing…" : publishState.ok ? "Published" : "Publish"}
          </button>
        </form>
      </div>

      {publishState.error ? (
        <p role="alert" className="w-full rounded bg-red-50 px-2 py-1 text-[11px] text-red-800">
          {publishState.error}
        </p>
      ) : null}
    </header>
  );
}

function ToolButton({
  title,
  onClick,
  icon,
  disabled,
}: {
  title: string;
  onClick: () => void;
  icon: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className="rounded p-1.5 text-neutral-600 transition-colors hover:bg-neutral-100 disabled:opacity-30"
    >
      {icon}
    </button>
  );
}

/**
 * In a product with no save button, this indicator is the trust mechanism.
 * It is always visible and never lies about state.
 */
function SaveIndicator() {
  const saveState = useEditor((state) => state.saveState);
  const saveError = useEditor((state) => state.saveError);

  const copy = {
    idle: "",
    dirty: "Unsaved changes",
    saving: "Saving…",
    saved: "All changes saved",
    error: saveError ?? "Couldn't save",
  }[saveState];

  if (!copy) return null;

  return (
    <span
      role="status"
      aria-live="polite"
      className={`flex items-center gap-1.5 text-[11px] ${
        saveState === "error" ? "font-medium text-red-700" : "text-neutral-400"
      }`}
    >
      {saveState === "saved" ? <icons.Check size={12} /> : null}
      {saveState === "error" ? <icons.TriangleAlert size={12} /> : null}
      {copy}
    </span>
  );
}
