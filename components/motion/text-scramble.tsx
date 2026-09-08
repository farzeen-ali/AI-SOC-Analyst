"use client";

import * as React from "react";
import { useInView } from "framer-motion";

import { usePrefersReducedMotion } from "@/lib/hooks/use-client-state";
import { cn } from "@/lib/utils";

const GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#$%&@/\\<>[]{}";

interface TextScrambleProps {
  text: string;
  className?: string;
  /** Milliseconds each character stays scrambled before it settles. */
  speed?: number;
}

/**
 * Resolves text from noise into place, one character at a time.
 *
 * A decode effect suits a security console, but it must never cost anyone the
 * content: the real string is rendered for screen readers and for anyone who
 * prefers reduced motion, and the animated glyphs are `aria-hidden`.
 */
export function TextScramble({
  text,
  className,
  speed = 28,
}: TextScrambleProps) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reducedMotion = usePrefersReducedMotion();
  // `null` means "settled" — the real text is what renders. Only the running
  // animation holds a value, so the effect never sets state synchronously.
  const [scrambled, setScrambled] = React.useState<string | null>(null);
  const display = scrambled ?? text;

  React.useEffect(() => {
    if (!inView || reducedMotion) return;

    let frame = 0;
    const settleAt = text
      .split("")
      .map((_, index) => index * 1.6 + Math.random() * 6);

    const interval = window.setInterval(() => {
      frame += 1;

      const next = text
        .split("")
        .map((char, index) => {
          if (char === " ") return " ";
          if (frame >= settleAt[index]) return char;
          return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        })
        .join("");

      setScrambled(next);

      if (frame > Math.max(...settleAt)) {
        window.clearInterval(interval);
        setScrambled(null);
      }
    }, speed);

    return () => window.clearInterval(interval);
  }, [inView, text, speed, reducedMotion]);

  return (
    <span ref={ref} className={cn("inline-block", className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">{display}</span>
    </span>
  );
}
