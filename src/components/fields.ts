import { z } from "zod";
import { linkSchema, NO_LINK, type Link } from "@/lib/links/types";

/** One entry in a navigation menu. */
export interface MenuItem {
  id: string;
  label: string;
  link: Link;
}

export const menuItemSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(100),
  link: linkSchema,
});

// Capped: a nav with hundreds of entries is a data problem, not a design.
export const menuItemsSchema = z.array(menuItemSchema).max(50);

/**
 * Field descriptors.
 *
 * One declaration produces three things that would otherwise drift apart:
 *   - the zod schema the API validates writes against
 *   - the control the inspector renders
 *   - the default value used when a component is inserted
 *
 * Adding a component costs one file instead of three, and there is no way to
 * ship a prop the server does not validate.
 */

export type Field =
  | { kind: "text"; label: string; default: string; placeholder?: string; max?: number }
  | { kind: "textarea"; label: string; default: string; placeholder?: string; max?: number }
  | { kind: "number"; label: string; default: number; min?: number; max?: number; step?: number }
  | { kind: "boolean"; label: string; default: boolean }
  | { kind: "enum"; label: string; default: string; options: { value: string; label: string }[] }
  | { kind: "link"; label: string }
  | { kind: "image"; label: string; default: string }
  | { kind: "alt"; label: string; default: string }
  | { kind: "menu"; label: string };

export type FieldMap = Record<string, Field>;

export const field = {
  text: (label: string, def = "", extra: { placeholder?: string; max?: number } = {}): Field => ({
    kind: "text",
    label,
    default: def,
    ...extra,
  }),
  textarea: (label: string, def = "", extra: { placeholder?: string; max?: number } = {}): Field => ({
    kind: "textarea",
    label,
    default: def,
    ...extra,
  }),
  number: (
    label: string,
    def = 0,
    extra: { min?: number; max?: number; step?: number } = {},
  ): Field => ({ kind: "number", label, default: def, ...extra }),
  boolean: (label: string, def = false): Field => ({ kind: "boolean", label, default: def }),
  enum: (label: string, options: { value: string; label: string }[], def?: string): Field => ({
    kind: "enum",
    label,
    options,
    default: def ?? options[0]!.value,
  }),
  link: (label = "Link"): Field => ({ kind: "link", label }),
  /**
   * A list of label + link pairs.
   *
   * Menu items live on the Nav node, which lives in the SITE HEADER document —
   * so editing them once changes every page. That is the whole reason a nav
   * cannot be a component people rebuild per page.
   */
  menu: (label = "Menu items"): Field => ({ kind: "menu", label }),
  image: (label = "Image", def = ""): Field => ({ kind: "image", label, default: def }),
  /**
   * Alt text is its own kind, not a plain string.
   *
   * The inspector renders it with a "decorative" checkbox that sets it to the
   * empty string, so an author must make a decision either way. An image
   * cannot be saved with alt simply left blank by accident — that single
   * choice is most of what separates accessible output from inaccessible.
   */
  alt: (label = "Alt text"): Field => ({ kind: "alt", label, default: "" }),
};

/** Builds the zod schema the API validates prop writes against. */
export function schemaFor(fields: FieldMap): z.ZodObject<z.ZodRawShape> {
  // Zod 4 types ZodRawShape as Readonly, so the shape is assembled in a
  // mutable record and handed over once complete.
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [name, spec] of Object.entries(fields)) {
    switch (spec.kind) {
      case "text":
      case "textarea":
        shape[name] = z.string().max(spec.max ?? 5000).optional();
        break;
      case "alt":
        shape[name] = z.string().max(500).optional();
        break;
      case "image":
        shape[name] = z.string().max(2048).optional();
        break;
      case "number":
        shape[name] = z.number().optional();
        break;
      case "boolean":
        shape[name] = z.boolean().optional();
        break;
      case "enum":
        shape[name] = z
          .enum(spec.options.map((option) => option.value) as [string, ...string[]])
          .optional();
        break;
      case "link":
        shape[name] = linkSchema.optional();
        break;
      case "menu":
        shape[name] = menuItemsSchema.optional();
        break;
    }
  }

  // Strip unknown keys rather than rejecting: a document saved by an older
  // client should not become unsavable because a prop was removed since.
  return z.object(shape).strip();
}

export function defaultsFor(fields: FieldMap): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};

  for (const [name, spec] of Object.entries(fields)) {
    if (spec.kind === "link") defaults[name] = NO_LINK;
    else if (spec.kind === "menu") defaults[name] = [];
    else defaults[name] = spec.default;
  }
  return defaults;
}
