"use client";

import * as React from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

import { usePrefersReducedMotion } from "@/lib/hooks/use-client-state";
import { cn } from "@/lib/utils";

/**
 * 3D pointer tilt.
 *
 * Only `transform` is animated, so the whole effect stays on the compositor
 * and never triggers layout or paint. Pointer position feeds motion values
 * directly — React never re-renders while the pointer moves.
 *
 * Disabled entirely for coarse pointers and for reduced-motion users, where a
 * perspective wobble is noise at best and nauseating at worst.
 */
export function TiltCard({
  children,
  className,
  strength = 7,
}: {
  children: React.ReactNode;
  className?: string;
  /** Maximum rotation in degrees at the card's edge. */
  strength?: number;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);

  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);

  const spring = { stiffness: 220, damping: 22, mass: 0.6 };
  const rotateX = useSpring(
    useTransform(py, [0, 1], [strength, -strength]),
    spring
  );
  const rotateY = useSpring(
    useTransform(px, [0, 1], [-strength, strength]),
    spring
  );

  const handleMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (reducedMotion || event.pointerType !== "mouse") return;
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    px.set((event.clientX - rect.left) / rect.width);
    py.set((event.clientY - rect.top) / rect.height);
  };

  const reset = () => {
    px.set(0.5);
    py.set(0.5);
  };

  if (reducedMotion) {
    return <div className={cn(className)}>{children}</div>;
  }

  return (
    <div
      ref={ref}
      onPointerMove={handleMove}
      onPointerLeave={reset}
      style={{ perspective: 1200 }}
      className={cn(className)}
    >
      <motion.div
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        className="will-change-transform"
      >
        {children}
      </motion.div>
    </div>
  );
}
