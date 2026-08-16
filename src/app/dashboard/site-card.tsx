"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import * as icons from "lucide-react";
import { deleteSiteAction, renameSiteAction, type SiteActionState } from "./actions";
import { createPageAction, type PageActionState } from "./pages/actions";

const EMPTY: SiteActionState = {};
const EMPTY_PAGE: PageActionState = {};

export interface SitePage {
  id: string;
  title: string;
  path: string;
  isPublished: boolean;
}

export function SiteCard({
  id,
  name,
  subdomain,
  status,
  url,
  updatedAt,
  pages,
}: {
  id: string;
  name: string;
  subdomain: string;
  status: string;
  url: string;
  updatedAt: string;
  pages: SitePage[];
}) {
  const [renameState, rename, renaming] = useActionState(renameSiteAction, EMPTY);
  const [deleteState, remove, deleting] = useActionState(deleteSiteAction, EMPTY);
  const [pageState, addPage, addingPage] = useActionState(createPageAction, EMPTY_PAGE);

  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const error = renameState.error ?? deleteState.error;

  return (
    <li className="rounded-lg border border-neutral-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          {editing ? (
            <form action={rename} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="siteId" value={id} />
              <input
                name="name"
                defaultValue={name}
                required
                maxLength={100}
                autoFocus
                aria-label="Site name"
                className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm outline-none focus-visible:border-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900/20"
              />
              <button
                type="submit"
                disabled={renaming}
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-60"
              >
                {renaming ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
            </form>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <h2 className="truncate text-base font-semibold">{name}</h2>
                {status === "SUSPENDED" ? (
                  <span className="rounded bg-red-100 px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wide text-red-800">
                    Suspended
                  </span>
                ) : null}
              </div>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-blue-700 underline underline-offset-2"
              >
                {subdomain}
              </a>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-neutral-400">
                Updated {new Date(updatedAt).toLocaleDateString()}
              </p>
            </>
          )}
        </div>

        {!editing ? (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm transition-colors hover:bg-neutral-100"
            >
              Rename
            </button>
            {confirming ? (
              <form action={remove} className="flex items-center gap-2">
                <input type="hidden" name="siteId" value={id} />
                <button
                  type="submit"
                  disabled={deleting}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-60"
                >
                  {deleting ? "Deleting…" : "Really delete"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-red-700 transition-colors hover:bg-red-50"
              >
                Delete
              </button>
            )}
          </div>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mx-4 mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="border-t border-neutral-100 px-4 py-3">
        <ul className="flex flex-col gap-1">
          {pages.map((page) => (
            <li key={page.id}>
              <Link
                href={`/dashboard/editor/${page.id}`}
                className="group flex items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors hover:bg-neutral-100"
              >
                <icons.FileText size={14} className="text-neutral-400" />
                <span className="font-medium">{page.title}</span>
                <span className="font-mono text-[11px] text-neutral-400">{page.path}</span>
                {!page.isPublished ? (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-amber-800">
                    Draft
                  </span>
                ) : null}
                <icons.Pencil
                  size={13}
                  className="ml-auto text-neutral-300 transition-colors group-hover:text-blue-600"
                />
              </Link>
            </li>
          ))}
        </ul>

        {addOpen ? (
          <form action={addPage} className="mt-2 flex flex-wrap items-center gap-2">
            <input type="hidden" name="siteId" value={id} />
            <input
              name="title"
              placeholder="Page title"
              required
              autoFocus
              aria-label="Page title"
              className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm outline-none focus-visible:border-neutral-900"
            />
            <button
              type="submit"
              disabled={addingPage}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-60"
            >
              {addingPage ? "Adding…" : "Add page"}
            </button>
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
            >
              Cancel
            </button>
            {pageState.error ? (
              <p role="alert" className="w-full text-sm text-red-700">
                {pageState.error}
              </p>
            ) : null}
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="mt-1 flex items-center gap-1.5 rounded px-2 py-1.5 text-sm text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
          >
            <icons.Plus size={14} />
            Add a page
          </button>
        )}
      </div>
    </li>
  );
}
