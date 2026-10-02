"use client";

import { motion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

const VARIANTS: Record<string, Variants> = {
  up: {
    hidden: { opacity: 0, y: 22 },
    shown: { opacity: 1, y: 0 },
  },
  down: {
    hidden: { opacity: 0, y: -18 },
    shown: { opacity: 1, y: 0 },
  },
  left: {
    hidden: { opacity: 0, x: -22 },
    shown: { opacity: 1, x: 0 },
  },
  right: {
    hidden: { opacity: 0, x: 22 },
    shown: { opacity: 1, x: 0 },
  },
  scale: {
    hidden: { opacity: 0, scale: 0.96 },
    shown: { opacity: 1, scale: 1 },
  },
  blur: {
    hidden: { opacity: 0, y: 16, filter: "blur(8px)" },
    shown: { opacity: 1, y: 0, filter: "blur(0px)" },
  },
};

export type RevealDirection = keyof typeof VARIANTS;

interface RevealProps {
  children: ReactNode;
  /** Position in a list — converted to a capped stagger delay. */
  index?: number;
  direction?: RevealDirection;
  /** `view` waits for the element to scroll in; `mount` runs immediately. */
  trigger?: "view" | "mount";
  duration?: number;
  className?: string;
}

/**
 * The single entrance animation used across the app.
 *
 * Consolidates what used to be two near-identical components. Stagger delay is
 * capped so a long list never leaves later items invisible for seconds.
 */
export function Reveal({
  children,
  index = 0,
  direction = "up",
  trigger = "view",
  duration = 0.5,
  className,
}: RevealProps) {
  const variants = VARIANTS[direction];
  const delay = Math.min(index * 0.07, 0.42);

  const activation =
    trigger === "view"
      ? { whileInView: "shown", viewport: VIEWPORT }
      : { animate: "shown" };

  return (
    <motion.div
      initial="hidden"
      variants={variants}
      transition={{ duration, delay, ease: EASE }}
      className={cn(className)}
      {...activation}
    >
      {children}
    </motion.div>
  );
}

/*
 * Entrance trigger.
 *
 * `amount: "some"` rather than a fraction: a fraction is measured against the
 * element's own height, so a tall section only part-way into the viewport
 * stays at `opacity: 0` even though the reader can already see it. A section
 * whose heading sat 60px above the fold on a 720px-tall viewport rendered as
 * a blank band until the user scrolled — visible, but invisible.
 *
 * The bottom margin grows the observer root so content resolves just before
 * it scrolls into view, which also means a fast scroll never outruns the
 * animation and leaves a gap.
 */
const VIEWPORT = { once: true, amount: "some", margin: "0px 0px 96px 0px" } as const;

/** Parent that staggers direct `RevealItem` children. */
export function RevealGroup({
  children,
  className,
  stagger = 0.07,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
}) {
  return (
    <motion.div
      initial="hidden"
      whileInView="shown"
      viewport={VIEWPORT}
      variants={{
        hidden: {},
        shown: { transition: { staggerChildren: stagger } },
      }}
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({
  children,
  direction = "up",
  className,
}: {
  children: ReactNode;
  direction?: RevealDirection;
  className?: string;
}) {
  return (
    <motion.div
      variants={VARIANTS[direction]}
      transition={{ duration: 0.5, ease: EASE }}
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
}
