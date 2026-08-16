"use client";

import * as icons from "lucide-react";
import type { MenuItem } from "@/components/fields";
import { parseLink } from "@/lib/links/types";
import { LinkPicker } from "./link-picker";
import { useSitePages } from "./site-context";

/**
 * Menu editor for a Nav node.
 *
 * The Nav lives in the site header document, so these items are edited once
 * and appear on every page. "Add all pages" exists because seeding a nav from
 * the pages you already have is the common case, and doing it by hand for a
 * five-page site is pure friction.
 */
export function MenuEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (value: MenuItem[]) => void;
}) {
  const pages = useSitePages();
  const items: MenuItem[] = Array.isArray(value) ? (value as MenuItem[]) : [];

  const update = (index: number, patch: Partial<MenuItem>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const move = (index: number, delta: number) => {
    const next = [...items];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  };

  const addItem = () =>
    onChange([
      ...items,
      {
        id: `m${Math.random().toString(36).slice(2, 10)}`,
        label: "New link",
        link: pages[0] ? { kind: "page", pageId: pages[0].id } : { kind: "none" },
      },
    ]);

  const addAllPages = () => {
    const linked = new Set(
      items.map((item) => (item.link.kind === "page" ? item.link.pageId : null)).filter(Boolean),
    );
    const additions = pages
      .filter((page) => !linked.has(page.id))
      .map((page) => ({
        id: `m${Math.random().toString(36).slice(2, 10)}`,
        label: page.title,
        link: { kind: "page" as const, pageId: page.id },
      }));

    if (additions.length > 0) onChange([...items, ...additions]);
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-medium text-neutral-600">{label}</span>

      {items.length === 0 ? (
        <p className="rounded border border-dashed border-neutral-300 px-2 py-3 text-center text-[11px] text-neutral-500">
          No links yet.
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {items.map((item, index) => {
          const link = parseLink(item.link);
          const broken =
            link.kind === "page" && !pages.some((page) => page.id === link.pageId);

          return (
            <li key={item.id} className="rounded border border-neutral-200 p-2">
              <div className="mb-1.5 flex items-center gap-1">
                <input
                  aria-label={`Menu item ${index + 1} label`}
                  className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1 text-[12px] outline-none focus-visible:border-blue-500"
                  value={item.label}
                  onChange={(event) => update(index, { label: event.target.value })}
                />
                <IconBtn label="Move up" disabled={index === 0} onClick={() => move(index, -1)}>
                  <icons.ChevronUp size={12} />
                </IconBtn>
                <IconBtn
                  label="Move down"
                  disabled={index === items.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <icons.ChevronDown size={12} />
                </IconBtn>
                <IconBtn
                  label="Remove"
                  onClick={() => onChange(items.filter((_, i) => i !== index))}
                >
                  <icons.X size={12} />
                </IconBtn>
              </div>

              <LinkPicker
                label="Goes to"
                value={item.link}
                onChange={(link) => update(index, { link })}
              />

              {broken ? (
                <p className="mt-1 text-[10.5px] text-amber-700">
                  This points at a page that no longer exists.
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={addItem}
          className="flex items-center gap-1 rounded border border-neutral-300 px-2 py-1 text-[11px] hover:bg-neutral-100"
        >
          <icons.Plus size={11} />
          Add link
        </button>
        {pages.length > 0 ? (
          <button
            type="button"
            onClick={addAllPages}
            className="rounded border border-neutral-300 px-2 py-1 text-[11px] hover:bg-neutral-100"
          >
            Add all pages
          </button>
        ) : null}
      </div>
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="shrink-0 rounded p-1 text-neutral-500 hover:bg-neutral-100 disabled:opacity-25"
    >
      {children}
    </button>
  );
}
