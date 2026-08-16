"use client";

import { useState } from "react";
import * as icons from "lucide-react";
import { useBreadcrumb, useEditor, useSelectedNode } from "@/store/editor";
import { getDef } from "@/components/registry";
import type { Field } from "@/components/fields";
import { BREAKPOINTS } from "@/lib/document/types";
import { StyleControls } from "./style-controls";
import { LinkPicker } from "./link-picker";
import { MenuEditor } from "./menu-editor";
import { ParentLayout } from "./parent-layout";

/**
 * The inspector is GENERATED from each component's field descriptors.
 *
 * Nothing here knows what a Heading or a Button is. Adding a component with a
 * new prop makes its control appear, and there is no way to ship a prop the
 * server does not validate — the same descriptor produces the zod schema.
 */
export function Inspector() {
  const node = useSelectedNode();
  const breadcrumb = useBreadcrumb();
  const breakpoint = useEditor((state) => state.breakpoint);

  if (!node) {
    return (
      <div className="p-4 text-[12px] leading-relaxed text-neutral-500">
        Select something on the canvas to edit it.
      </div>
    );
  }

  const def = getDef(node.type);
  if (!def) return null;

  const fields = Object.entries(def.fields);
  const breakpointLabel = BREAKPOINTS.find((entry) => entry.key === breakpoint)?.label ?? "";

  return (
    <div className="flex flex-col">
      {/* Breadcrumb: the way back out of a deeply nested selection. */}
      <nav aria-label="Selection path" className="flex flex-wrap items-center gap-0.5 border-b border-neutral-200 px-3 py-2">
        {breadcrumb.map((ancestor, index) => (
          <span key={ancestor.id} className="flex items-center gap-0.5">
            {index > 0 ? <icons.ChevronRight size={11} className="text-neutral-300" /> : null}
            <button
              type="button"
              onClick={() => useEditor.getState().select(ancestor.id)}
              onMouseEnter={() => useEditor.getState().hover(ancestor.id)}
              onMouseLeave={() => useEditor.getState().hover(null)}
              className={`rounded px-1 py-0.5 text-[11px] ${
                index === breadcrumb.length - 1
                  ? "font-semibold text-neutral-900"
                  : "text-neutral-500 hover:bg-neutral-100"
              }`}
            >
              {getDef(ancestor.type)?.label ?? ancestor.type}
            </button>
          </span>
        ))}
      </nav>

      <div className="flex items-center justify-between px-3 py-2.5">
        <h2 className="text-[13px] font-semibold">{def.label}</h2>
        <div className="flex gap-1">
          <IconButton
            title="Duplicate"
            onClick={() => useEditor.getState().duplicate(node.id)}
            icon={<icons.Copy size={13} />}
          />
          <IconButton
            title="Delete"
            onClick={() => useEditor.getState().remove(node.id)}
            icon={<icons.Trash2 size={13} />}
            danger
          />
        </div>
      </div>

      {/* Sits above Content because it answers "why isn't this where I want
          it?", which is the question people arrive with. */}
      <ParentLayout node={node} />

      {fields.length > 0 ? (
        <Section title="Content">
          {fields.map(([name, spec]) => (
            <FieldControl
              key={name}
              name={name}
              spec={spec}
              value={node.props[name]}
              onChange={(value) => useEditor.getState().updateProps(node.id, { [name]: value })}
            />
          ))}
        </Section>
      ) : null}

      <Section title={`Style — ${breakpointLabel}`}>
        <StyleControls node={node} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);

  return (
    <section className="border-t border-neutral-200">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-400">
          {title}
        </span>
        <icons.ChevronDown
          size={12}
          className="text-neutral-400"
          style={{ transform: open ? undefined : "rotate(-90deg)" }}
        />
      </button>
      {open ? <div className="flex flex-col gap-3 px-3 pb-4">{children}</div> : null}
    </section>
  );
}

function IconButton({
  title,
  onClick,
  icon,
  danger,
}: {
  title: string;
  onClick: () => void;
  icon: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`rounded border border-neutral-200 p-1.5 transition-colors ${
        danger ? "text-red-600 hover:bg-red-50" : "text-neutral-600 hover:bg-neutral-100"
      }`}
    >
      {icon}
    </button>
  );
}

const inputClass =
  "w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-[12px] outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/20";

function FieldControl({
  name,
  spec,
  value,
  onChange,
}: {
  name: string;
  spec: Field;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const id = `field-${name}`;

  switch (spec.kind) {
    case "text":
      return (
        <Labelled id={id} label={spec.label}>
          <input
            id={id}
            className={inputClass}
            value={typeof value === "string" ? value : ""}
            maxLength={spec.max}
            placeholder={spec.placeholder}
            onChange={(event) => onChange(event.target.value)}
          />
        </Labelled>
      );

    case "textarea":
      return (
        <Labelled id={id} label={spec.label}>
          <textarea
            id={id}
            rows={4}
            className={`${inputClass} resize-y`}
            value={typeof value === "string" ? value : ""}
            maxLength={spec.max}
            onChange={(event) => onChange(event.target.value)}
          />
        </Labelled>
      );

    case "enum":
      return (
        <Labelled id={id} label={spec.label}>
          <select
            id={id}
            className={inputClass}
            value={typeof value === "string" ? value : spec.default}
            onChange={(event) => onChange(event.target.value)}
          >
            {spec.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Labelled>
      );

    case "boolean":
      return (
        <label className="flex items-center gap-2 text-[12px]">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(event) => onChange(event.target.checked)}
          />
          {spec.label}
        </label>
      );

    case "number":
      return (
        <Labelled id={id} label={spec.label}>
          <input
            id={id}
            type="number"
            className={inputClass}
            value={typeof value === "number" ? value : spec.default}
            min={spec.min}
            max={spec.max}
            step={spec.step}
            onChange={(event) => onChange(Number(event.target.value))}
          />
        </Labelled>
      );

    case "image":
      return (
        <Labelled id={id} label={spec.label}>
          <input
            id={id}
            className={inputClass}
            placeholder="https://…"
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
          />
          <p className="mt-1 text-[10.5px] text-neutral-400">
            Paste a URL for now — uploads arrive with the asset manager.
          </p>
        </Labelled>
      );

    case "alt":
      return <AltField id={id} spec={spec} value={value} onChange={onChange} />;

    case "link":
      return <LinkPicker label={spec.label} value={value} onChange={onChange} />;

    case "menu":
      return <MenuEditor label={spec.label} value={value} onChange={onChange} />;
  }
}

/**
 * Alt text with an explicit decorative option.
 *
 * A plain text box invites people to leave it blank, and blank alt on a
 * meaningful image is the single most common accessibility defect on the web.
 * Forcing the decision — describe it, or declare it decorative — costs one
 * checkbox and removes the ambiguity entirely.
 */
function AltField({
  id,
  spec,
  value,
  onChange,
}: {
  id: string;
  spec: Field & { kind: "alt" };
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const text = typeof value === "string" ? value : "";
  const [decorative, setDecorative] = useState(text === "");

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[11px] font-medium text-neutral-600">
        {spec.label}
      </label>
      <input
        id={id}
        className={inputClass}
        value={text}
        disabled={decorative}
        placeholder="Describe what the image shows"
        onChange={(event) => onChange(event.target.value)}
      />
      <label className="flex items-center gap-1.5 text-[11px] text-neutral-600">
        <input
          type="checkbox"
          checked={decorative}
          onChange={(event) => {
            setDecorative(event.target.checked);
            if (event.target.checked) onChange("");
          }}
        />
        Decorative — screen readers should skip it
      </label>
    </div>
  );
}

function Labelled({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[11px] font-medium text-neutral-600">
        {label}
      </label>
      {children}
    </div>
  );
}
