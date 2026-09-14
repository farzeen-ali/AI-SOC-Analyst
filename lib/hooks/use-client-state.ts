"use client";

import { useSyncExternalStore } from "react";

/**
 * Hydration-safe client hooks built on `useSyncExternalStore`.
 *
 * These replace the `useState(false)` + `useEffect(() => setState(true))`
 * pattern: the server snapshot is used for SSR and the hydration pass, and the
 * client snapshot takes over afterwards. Same result, no cascading render.
 */

const noopSubscribe = () => () => {};

/** `false` during SSR and hydration, `true` once mounted on the client. */
export function useIsMounted(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Tracks the user's reduced-motion preference, and reacts if they change it
 * mid-session. Assumes `false` on the server so markup matches.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false
  );
}

function subscribeToVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

/**
 * Whether the tab is currently visible.
 *
 * Read through `useSyncExternalStore` rather than a `useState` + effect pair,
 * so visibility is derived during render and never needs a synchronous
 * `setState` inside an effect body. Assumes visible on the server.
 */
export function useDocumentVisible(): boolean {
  return useSyncExternalStore(
    subscribeToVisibility,
    () => !document.hidden,
    () => true
  );
}
