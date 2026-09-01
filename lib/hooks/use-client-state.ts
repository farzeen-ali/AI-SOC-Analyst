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
