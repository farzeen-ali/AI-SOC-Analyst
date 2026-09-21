"use client";

import * as React from "react";
import { motion, useScroll, useSpring, useTransform } from "framer-motion";

import { usePrefersReducedMotion } from "@/lib/hooks/use-client-state";
import { cn } from "@/lib/utils";

/**
 * Scroll-linked parallax.
 *
 * Driven by `useScroll` against the element's own offset, so the movement is
 * tied to scroll position rather than to a timer — it tracks a trackpad fling
 * and a scrollbar drag identically. The spring smooths the raw scroll value so
 * fast flings do not snap.
 *
 * Transform-only, and inert under reduced motion.
 */
export function Parallax({
  children,
  className,
  /** Total travel in pixels across the element's full scroll pass. */
  distance = 60,
  direction = "up",
}: {
  children: React.ReactNode;
  className?: string;
  distance?: number;
  direction?: "up" | "down";
}) {
  const reducedMotion = usePrefersReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const smooth = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 26,
    restDelta: 0.001,
  });

  const travel = direction === "up" ? -distance : distance;
  const y = useTransform(smooth, [0, 1], [-travel, travel]);

  if (reducedMotion) {
    return <div className={cn(className)}>{children}</div>;
  }

  return (
    <div ref={ref} className={cn(className)}>
      <motion.div style={{ y }} className="will-change-transform">
        {children}
      </motion.div>
    </div>
  );
}

/**
 * Words rise into place one after another.
 *
 * Driven by a CSS keyframe with a per-word `animation-delay`, deliberately
 * *not* by a JS viewport trigger. This text is the hero headline and the LCP
 * element: gating it behind `whileInView` left it blank until something
 * scrolled, and would strand it entirely if the main thread were busy.
 *
 * `animation-fill-mode: both` means a word is hidden only while its animation
 * is pending, and the global `prefers-reduced-motion` rule collapses the
 * duration so the final state paints immediately. CSS always runs; JS might
 * not.
 *
 * The text is rendered exactly once. An earlier version mirrored it into an
 * `sr-only` copy alongside an `aria-hidden` animated copy, which read
 * correctly but put the headline in the DOM twice — a doubled <h1> is a real
 * cost for crawlers. Non-breaking spaces keep the split words joined as one
 * phrase for assistive tech.
 */
export function WordReveal({
  text,
  className,
  wordClassName,
  delay = 0,
}: {
  text: string;
  className?: string;
  /**
   * Applied to each word's own span.
   *
   * Needed for gradient text: `background-clip: text` only clips the
   * background of the element that carries it, so putting the gradient on a
   * wrapper leaves these inline-block words transparent with nothing painted
   * behind them — i.e. invisible. Each word must carry the gradient itself.
   */
  wordClassName?: string;
  /** Seconds to wait before the first word rises. */
  delay?: number;
}) {
  const words = text.split(" ");

  return (
    <span className={cn("inline", className)}>
      {words.map((word, index) => (
        <span
          key={`${word}-${index}`}
          className="inline-block overflow-hidden align-bottom"
        >
          <span
            className={cn("animate-word-rise inline-block", wordClassName)}
            style={{ animationDelay: `${delay + index * 0.045}s` }}
          >
            {word}
            {index < words.length - 1 ? " " : ""}
          </span>
        </span>
      ))}
    </span>
  );
}
