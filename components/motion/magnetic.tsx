"use client";

import * as React from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

import { usePrefersReducedMotion } from "@/lib/hooks/use-client-state";
import { cn } from "@/lib/utils";

/**
 * Magnetic hover: the element leans toward the cursor and springs back.
 *
 * Wraps rather than replaces its child, so the child keeps being a real
 * button or link — the magnetism is decoration on top of a working control,
 * never a substitute for one. Mouse-only and reduced-motion aware.
 */
export function Magnetic({
  children,
  className,
  radius = 0.32,
}: {
  children: React.ReactNode;
  className?: string;
  /** How far the element travels, as a fraction of its own size. */
  radius?: number;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const spring = { stiffness: 260, damping: 18, mass: 0.5 };
  const sx = useSpring(x, spring);
  const sy = useSpring(y, spring);

  const handleMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (reducedMotion || event.pointerType !== "mouse") return;
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    x.set((event.clientX - (rect.left + rect.width / 2)) * radius);
    y.set((event.clientY - (rect.top + rect.height / 2)) * radius);
  };

  const reset = () => {
    x.set(0);
    y.set(0);
  };

  if (reducedMotion) {
    return <div className={cn("inline-flex", className)}>{children}</div>;
  }

  return (
    <motion.div
      ref={ref}
      onPointerMove={handleMove}
      onPointerLeave={reset}
      style={{ x: sx, y: sy }}
      className={cn("inline-flex will-change-transform", className)}
    >
      {children}
    </motion.div>
  );
}
