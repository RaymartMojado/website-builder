"use client";

import { useEditor } from "@/store/editor";
import type { DocNode } from "@/lib/document/types";
import { DEFAULT_THEME } from "@/lib/document/types";
import { contrastRatio, resolveColor } from "@/lib/styles/contrast";
import { SizeControl } from "./size-control";

/**
 * Style controls for the active breakpoint.
 *
 * Every control shows whether the value is SET at this breakpoint or inherited
 * from a smaller one, with a reset. Without that distinction, editing at
 * Desktop silently writes an override that then does not follow later mobile
 * edits — which is the single most confusing thing about responsive builders.
 */

const inputClass =
  "w-full rounded border border-neutral-300 bg-white px-2 py-1 text-[12px] outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/20";

export function StyleControls({ node }: { node: DocNode }) {
  const breakpoint = useEditor((state) => state.breakpoint);

  const own = node.style[breakpoint] ?? {};
  /** Effective value: this breakpoint, else the ones below it. */
  const effective = (property: string): string => {
    const order = breakpoint === "lg" ? ["lg", "md", "base"] : breakpoint === "md" ? ["md", "base"] : ["base"];
    for (const key of order) {
      const value = node.style[key as "base"]?.[property];
      if (value !== undefined) return String(value);
    }
    return "";
  };

  const set = (property: string, value: string | undefined) =>
    useEditor.getState().updateStyle(node.id, { [property]: value });

  const isOwn = (property: string) => property in own;

  // An unset flex-direction is `row` in CSS. Alignment wording follows it,
  // because "across" and "down" swap axes when the container is a column.
  const isRow = !(effective("flexDirection") || "row").startsWith("column");

  return (
    <div className="flex flex-col gap-3">
      <Row label="Layout">
        <Select
          property="display"
          value={effective("display")}
          own={isOwn("display")}
          onChange={set}
          options={["", "block", "flex", "inline-flex", "grid", "inline-block", "none"]}
        />
        {effective("display").includes("flex") ? (
          <>
            <Select
              property="flexDirection"
              value={effective("flexDirection")}
              own={isOwn("flexDirection")}
              onChange={set}
              options={["", "row", "column", "row-reverse", "column-reverse"]}
              labelOverride="Direction"
              labels={{
                row: "Side by side",
                column: "Stacked",
                "row-reverse": "Side by side, reversed",
                "column-reverse": "Stacked, reversed",
              }}
            />
            {/*
              CSS names these justify-content and align-items, which mean
              nothing to someone who does not write CSS. The wording below
              describes the effect instead — and it follows the direction,
              because "along the row" and "across the row" swap meaning when
              the container is a column.
            */}
            <Select
              property="justifyContent"
              value={effective("justifyContent")}
              own={isOwn("justifyContent")}
              onChange={set}
              options={["", "flex-start", "center", "flex-end", "space-between", "space-around"]}
              labelOverride={isRow ? "Across" : "Down"}
              labels={{
                "flex-start": isRow ? "Left" : "Top",
                center: "Centre",
                "flex-end": isRow ? "Right" : "Bottom",
                "space-between": "Spread apart",
                "space-around": "Even gaps",
              }}
            />
            <Select
              property="alignItems"
              value={effective("alignItems")}
              own={isOwn("alignItems")}
              onChange={set}
              options={["", "stretch", "flex-start", "center", "flex-end", "baseline"]}
              labelOverride={isRow ? "Down" : "Across"}
              labels={{
                stretch: "Fill",
                "flex-start": isRow ? "Top" : "Left",
                center: "Centre",
                "flex-end": isRow ? "Bottom" : "Right",
                baseline: "Text baseline",
              }}
            />
            <Text property="gap" value={effective("gap")} own={isOwn("gap")} onChange={set} placeholder="16px" />
          </>
        ) : null}

        {/*
          "Fill space" is flex-grow, named for what it does rather than what it
          is called in CSS.

          It is here because of a specific dead end: a nav sitting next to a
          logo is only as wide as its own links, so setting Align to centre on
          it appears to do nothing at all. Centring the header instead moves
          the logo too. Letting the nav fill the leftover space is what makes
          "centre only the navigation" actually reachable.
        */}
        <Select
          property="flexGrow"
          value={effective("flexGrow")}
          own={isOwn("flexGrow")}
          onChange={set}
          options={["", "0", "1"]}
          labels={{ "": "—", "0": "No — hug content", "1": "Yes — fill the row" }}
          labelOverride="Fill space"
        />
      </Row>

      <Row label="Spacing">
        <Text property="padding" value={effective("padding")} own={isOwn("padding")} onChange={set} placeholder="16px 24px" />
        <Text property="margin" value={effective("margin")} own={isOwn("margin")} onChange={set} placeholder="0 auto" />
      </Row>

      <Row label="Size">
        {/* Presets and a slider first — typing "33%" assumes you already know
            width is a percentage of the parent and that % is a valid unit
            here. The text field stays below for exact values. */}
        <SizeControl node={node} />
        <Text property="width" value={effective("width")} own={isOwn("width")} onChange={set} placeholder="auto" />
        <Text property="maxWidth" value={effective("maxWidth")} own={isOwn("maxWidth")} onChange={set} placeholder="1100px" />
        <Text property="height" value={effective("height")} own={isOwn("height")} onChange={set} placeholder="auto" />
      </Row>

      <Row label="Type">
        <Text property="fontSize" value={effective("fontSize")} own={isOwn("fontSize")} onChange={set} placeholder="16px" />
        <Select
          property="fontWeight"
          value={effective("fontWeight")}
          own={isOwn("fontWeight")}
          onChange={set}
          options={["", "300", "400", "500", "600", "700", "800"]}
        />
        <Text property="lineHeight" value={effective("lineHeight")} own={isOwn("lineHeight")} onChange={set} placeholder="1.5" />
        <Select
          property="textAlign"
          value={effective("textAlign")}
          own={isOwn("textAlign")}
          onChange={set}
          options={["", "left", "center", "right", "justify"]}
        />
      </Row>

      <Row label="Colour">
        <Colour
          property="color"
          value={effective("color")}
          own={isOwn("color")}
          onChange={set}
          against={effective("backgroundColor")}
        />
        <Colour
          property="backgroundColor"
          value={effective("backgroundColor")}
          own={isOwn("backgroundColor")}
          onChange={set}
        />
        <Text property="borderRadius" value={effective("borderRadius")} own={isOwn("borderRadius")} onChange={set} placeholder="8px" />
      </Row>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-neutral-400">
        {label}
      </legend>
      {children}
    </fieldset>
  );
}

interface ControlProps {
  property: string;
  value: string;
  own: boolean;
  onChange: (property: string, value: string | undefined) => void;
}

function ControlShell({
  property,
  own,
  onChange,
  labelOverride,
  children,
}: ControlProps & { labelOverride?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <label
        htmlFor={`style-${property}`}
        className="w-[86px] shrink-0 truncate text-[11px] text-neutral-500"
        title={property}
      >
        {labelOverride ?? humanise(property)}
      </label>
      {children}
      <button
        type="button"
        title={own ? "Reset — inherit from a smaller screen" : "Not set at this breakpoint"}
        aria-label={`Reset ${property}`}
        disabled={!own}
        onClick={() => onChange(property, undefined)}
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          own ? "bg-blue-600 hover:bg-red-500" : "bg-neutral-200"
        }`}
      />
    </div>
  );
}

function Text({ placeholder, ...props }: ControlProps & { placeholder?: string }) {
  return (
    <ControlShell {...props}>
      <input
        id={`style-${props.property}`}
        className={inputClass}
        value={props.value}
        placeholder={placeholder}
        onChange={(event) => props.onChange(props.property, event.target.value || undefined)}
      />
    </ControlShell>
  );
}

function Select({
  options,
  labels,
  ...props
}: ControlProps & {
  options: string[];
  /** Human wording for values whose CSS name would mean nothing to an author. */
  labels?: Record<string, string>;
  labelOverride?: string;
}) {
  return (
    <ControlShell {...props}>
      <select
        id={`style-${props.property}`}
        className={inputClass}
        value={props.value}
        onChange={(event) => props.onChange(props.property, event.target.value || undefined)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {labels?.[option] ?? (option || "—")}
          </option>
        ))}
      </select>
    </ControlShell>
  );
}

/**
 * Colour with a live contrast readout.
 *
 * The ratio is shown where the colour is chosen, not in a report afterwards —
 * an accessibility problem you can see while you are causing it mostly does
 * not get created.
 */
function Colour({ against, ...props }: ControlProps & { against?: string }) {
  const resolved = resolveColor(props.value, DEFAULT_THEME);
  const backdrop = resolveColor(against || "var(--color-background)", DEFAULT_THEME);
  const ratio = resolved && backdrop ? contrastRatio(resolved, backdrop) : null;

  return (
    <div className="flex flex-col gap-1">
      <ControlShell {...props}>
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <input
            type="color"
            aria-label={`${humanise(props.property)} swatch`}
            value={resolved ?? "#000000"}
            onChange={(event) => props.onChange(props.property, event.target.value)}
            className="h-6 w-7 shrink-0 cursor-pointer rounded border border-neutral-300 bg-white p-0.5"
          />
          <input
            id={`style-${props.property}`}
            className={inputClass}
            value={props.value}
            placeholder="var(--color-text)"
            onChange={(event) => props.onChange(props.property, event.target.value || undefined)}
          />
        </span>
      </ControlShell>

      {props.property === "color" && ratio !== null ? (
        <p
          className={`ml-[92px] text-[10.5px] ${
            ratio >= 4.5 ? "text-neutral-400" : "text-amber-700"
          }`}
        >
          Contrast {ratio.toFixed(1)}:1{" "}
          {ratio >= 4.5 ? "· passes AA" : "· below the 4.5:1 minimum for body text"}
        </p>
      ) : null}
    </div>
  );
}

function humanise(property: string): string {
  return property
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase())
    .toLowerCase()
    .replace(/^./, (letter) => letter.toUpperCase());
}
