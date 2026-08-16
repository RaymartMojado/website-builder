import type { Theme } from "@/lib/document/types";

/**
 * WCAG contrast, used live in the colour picker.
 *
 * Showing the ratio at the moment a colour is chosen is worth far more than
 * reporting it later: an author fixes what they can see, and mostly does not
 * create the problem in the first place.
 */

/** Resolves a stored value — hex, rgb(), or a theme token — to a hex string. */
export function resolveColor(value: string, theme: Theme): string | null {
  if (!value) return null;

  const token = /^var\(--color-([a-z0-9-]+)\)$/i.exec(value.trim());
  if (token) {
    const resolved = theme.colors[token[1]!];
    return resolved ? normaliseHex(resolved) : null;
  }

  return normaliseHex(value.trim());
}

function normaliseHex(value: string): string | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value);
  if (hex) {
    let digits = hex[1]!;
    if (digits.length <= 4) digits = digits.split("").map((d) => d + d).join("");
    return `#${digits.slice(0, 6).toLowerCase()}`;
  }

  const rgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(value);
  if (rgb) {
    const channels = [rgb[1], rgb[2], rgb[3]].map((part) =>
      Math.max(0, Math.min(255, Number(part))).toString(16).padStart(2, "0"),
    );
    return `#${channels.join("")}`;
  }

  if (value.toLowerCase() === "white") return "#ffffff";
  if (value.toLowerCase() === "black") return "#000000";

  return null;
}

function channelLuminance(channel: number): number {
  const normalised = channel / 255;
  return normalised <= 0.03928
    ? normalised / 12.92
    : Math.pow((normalised + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  return (
    0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
  );
}

/** WCAG 2.x contrast ratio, 1:1 to 21:1. */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

export type ContrastLevel = "fail" | "aa-large" | "aa" | "aaa";

export function contrastLevel(ratio: number): ContrastLevel {
  if (ratio >= 7) return "aaa";
  if (ratio >= 4.5) return "aa";
  if (ratio >= 3) return "aa-large";
  return "fail";
}
