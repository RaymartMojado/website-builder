"use client";

import { useEffect, useState } from "react";
import { useEditor } from "@/store/editor";

/**
 * Keyboard shortcuts.
 *
 * Bound on the parent document AND on the canvas iframe's document — an iframe
 * gets its own key events, so focus inside the canvas would otherwise swallow
 * every shortcut, which is exactly where people press Ctrl+Z.
 */

const SHORTCUTS: [string, string][] = [
  ["Ctrl / ⌘ + Z", "Undo"],
  ["Ctrl / ⌘ + Shift + Z", "Redo"],
  ["Delete / Backspace", "Delete selection"],
  ["Ctrl / ⌘ + D", "Duplicate selection"],
  ["Escape", "Deselect, or select the parent"],
  ["Ctrl / ⌘ + P", "Toggle preview"],
  ["?", "Show this list"],
];

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      // Never hijack keys while someone is typing into the inspector.
      if (isTypingTarget(event.target)) return;

      const store = useEditor.getState();
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (modifier && key === "z") {
        event.preventDefault();
        if (event.shiftKey) store.redo();
        else store.undo();
        return;
      }

      if (modifier && key === "y") {
        event.preventDefault();
        store.redo();
        return;
      }

      if (modifier && key === "d") {
        event.preventDefault();
        if (store.selectedId) store.duplicate(store.selectedId);
        return;
      }

      if (modifier && key === "p") {
        event.preventDefault();
        store.togglePreview();
        return;
      }

      if (key === "delete" || key === "backspace") {
        if (!store.selectedId) return;
        event.preventDefault();
        store.remove(store.selectedId);
        return;
      }

      if (key === "escape") {
        event.preventDefault();
        // Step out one level rather than clearing — reaching a parent you
        // cannot click is the common case.
        if (store.selectedId) store.selectParent();
        return;
      }

      if (event.key === "?") {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("editor:toggle-help"));
      }
    };

    document.addEventListener("keydown", handler);

    // Also bind inside the canvas, where focus usually is.
    let frameDocument: Document | null = null;
    const attachToFrame = () => {
      const frame = document.querySelector("iframe[title='Page canvas']") as HTMLIFrameElement | null;
      const candidate = frame?.contentDocument ?? null;
      if (candidate && candidate !== frameDocument) {
        frameDocument = candidate;
        candidate.addEventListener("keydown", handler);
      }
    };

    attachToFrame();
    const poll = setInterval(attachToFrame, 500);

    return () => {
      document.removeEventListener("keydown", handler);
      frameDocument?.removeEventListener("keydown", handler);
      clearInterval(poll);
    };
  }, []);
}

export function KeyboardHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const toggle = () => setOpen((value) => !value);
    window.addEventListener("editor:toggle-help", toggle);
    return () => window.removeEventListener("editor:toggle-help", toggle);
  }, []);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-3 left-3 rounded-full border border-neutral-300 bg-white px-2.5 py-1 text-[11px] text-neutral-500 shadow-sm hover:bg-neutral-50"
      >
        Shortcuts ?
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Keyboard shortcuts"
      className="fixed bottom-3 left-3 w-[280px] rounded-lg border border-neutral-200 bg-white p-3 shadow-lg"
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[12px] font-semibold">Keyboard shortcuts</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="rounded px-1 text-neutral-400 hover:bg-neutral-100"
        >
          ×
        </button>
      </div>
      <dl className="flex flex-col gap-1">
        {SHORTCUTS.map(([keys, description]) => (
          <div key={keys} className="flex items-baseline justify-between gap-3">
            <dt className="font-mono text-[10.5px] text-neutral-500">{keys}</dt>
            <dd className="text-[11px] text-neutral-700">{description}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 border-t border-neutral-100 pt-2 text-[10.5px] leading-snug text-neutral-400">
        Prefer not to drag? The Layers panel moves and nests anything from the keyboard.
      </p>
    </div>
  );
}
