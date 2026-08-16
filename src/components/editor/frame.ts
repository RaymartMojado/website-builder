"use client";

/**
 * A handle on the canvas iframe.
 *
 * The palette lives in the parent document but has to hit-test against
 * elements inside the iframe while a drag is in flight. Threading a ref
 * through the whole editor tree for one cross-boundary interaction is worse
 * than a small module-scoped handle — there is exactly one canvas at a time.
 */

let frame: HTMLIFrameElement | null = null;

export function setCanvasFrame(element: HTMLIFrameElement | null): void {
  frame = element;
}

export function getCanvasFrame(): HTMLIFrameElement | null {
  return frame;
}

export function getCanvasDocument(): Document | null {
  return frame?.contentDocument ?? null;
}

/** Converts a parent-document point into iframe-local coordinates. */
export function toFramePoint(clientX: number, clientY: number): { x: number; y: number } | null {
  if (!frame) return null;
  const rect = frame.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

export function isOverCanvas(clientX: number, clientY: number): boolean {
  if (!frame) return false;
  const rect = frame.getBoundingClientRect();
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}
