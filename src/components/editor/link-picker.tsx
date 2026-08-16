"use client";

import { parseLink, type Link } from "@/lib/links/types";
import { useSitePages } from "./site-context";

/**
 * Link picker.
 *
 * Page links are chosen from a list and stored as an id, never typed as a URL.
 * That is what makes renaming a page safe and lets the editor say exactly what
 * breaks before a page is deleted.
 */

const inputClass =
  "w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-[12px] outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/20";

export function LinkPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (value: Link) => void;
}) {
  const pages = useSitePages();
  const link = parseLink(value);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium text-neutral-600">{label}</span>

      <select
        aria-label={`${label} type`}
        className={inputClass}
        value={link.kind}
        onChange={(event) => onChange(emptyLinkOf(event.target.value, pages[0]?.id))}
      >
        <option value="none">No link</option>
        <option value="page">A page on this site</option>
        <option value="external">Web address</option>
        <option value="email">Email</option>
        <option value="phone">Phone</option>
      </select>

      {link.kind === "page" ? (
        <>
          <select
            aria-label="Target page"
            className={inputClass}
            value={link.pageId}
            onChange={(event) => onChange({ kind: "page", pageId: event.target.value })}
          >
            {pages.length === 0 ? <option value="">No other pages yet</option> : null}
            {pages.map((page) => (
              <option key={page.id} value={page.id}>
                {page.title} — {page.path}
              </option>
            ))}
          </select>
          {!pages.some((page) => page.id === link.pageId) ? (
            <p className="text-[10.5px] text-amber-700">
              This points at a page that no longer exists.
            </p>
          ) : null}
        </>
      ) : null}

      {link.kind === "external" ? (
        <>
          <input
            aria-label="Web address"
            className={inputClass}
            placeholder="https://example.com"
            value={link.url}
            onChange={(event) =>
              onChange({ kind: "external", url: event.target.value, newTab: link.newTab })
            }
          />
          <label className="flex items-center gap-1.5 text-[11px] text-neutral-600">
            <input
              type="checkbox"
              checked={link.newTab ?? false}
              onChange={(event) =>
                onChange({ kind: "external", url: link.url, newTab: event.target.checked })
              }
            />
            Open in a new tab
          </label>
        </>
      ) : null}

      {link.kind === "email" ? (
        <input
          aria-label="Email address"
          className={inputClass}
          placeholder="hello@example.com"
          value={link.address}
          onChange={(event) => onChange({ kind: "email", address: event.target.value })}
        />
      ) : null}

      {link.kind === "phone" ? (
        <input
          aria-label="Phone number"
          className={inputClass}
          placeholder="+1 555 010 9999"
          value={link.number}
          onChange={(event) => onChange({ kind: "phone", number: event.target.value })}
        />
      ) : null}
    </div>
  );
}

function emptyLinkOf(kind: string, firstPageId?: string): Link {
  switch (kind) {
    case "page":
      return { kind: "page", pageId: firstPageId ?? "" };
    case "external":
      return { kind: "external", url: "" };
    case "email":
      return { kind: "email", address: "" };
    case "phone":
      return { kind: "phone", number: "" };
    default:
      return { kind: "none" };
  }
}
