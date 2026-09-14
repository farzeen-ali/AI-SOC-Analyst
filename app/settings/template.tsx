/**
 * Page transition for this route tree.
 *
 * `template.tsx` remounts on navigation, so the entrance animation replays on
 * every route change. It is driven by a CSS keyframe rather than a JS-gated
 * `initial: { opacity: 0 }`: a CSS animation cannot leave content stranded
 * invisible if the main thread is busy or rAF is throttled, and the global
 * `prefers-reduced-motion` rule in globals.css disables it for free.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-rise">{children}</div>;
}
