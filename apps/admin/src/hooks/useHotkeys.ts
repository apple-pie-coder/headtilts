import { useEffect, useRef } from 'react';

export type HotkeyMap = Record<string, (e: KeyboardEvent) => void>;

export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

// Shared across every useHotkeys instance so that, e.g., the "a" in the global
// "g a" sequence never also triggers a page's single-key "a" binding.
let prefix = '';
let prefixTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Single-key and two-key sequence shortcuts ("n", "/", "g p") that are ignored
 * while the user is typing in a field or holding a modifier, and while a
 * modal dialog is open.
 */
export function useHotkeys(map: HotkeyMap, enabled = true) {
  const mapRef = useRef(map);
  mapRef.current = map;

  useEffect(() => {
    if (!enabled) return;

    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (document.querySelector('[aria-modal="true"]')) return;

      const combo = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      if (prefix) {
        // Second key of a sequence: only sequence bindings may fire. The prefix
        // is cleared after every listener has seen this event.
        const fn = mapRef.current[`${prefix} ${combo}`];
        if (fn) { e.preventDefault(); fn(e); }
        setTimeout(() => { prefix = ''; }, 0);
        return;
      }

      const fn = mapRef.current[combo];
      if (fn) {
        e.preventDefault();
        fn(e);
        return;
      }
      if (Object.keys(mapRef.current).some((k) => k.startsWith(`${combo} `))) {
        // Defer so other listeners for this same keypress still see no prefix.
        setTimeout(() => {
          prefix = combo;
          clearTimeout(prefixTimer);
          prefixTimer = setTimeout(() => { prefix = ''; }, 900);
        }, 0);
      }
    }

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [enabled]);
}
