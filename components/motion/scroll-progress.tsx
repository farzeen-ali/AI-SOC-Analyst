"use client";

import { motion, useScroll, useSpring } from "framer-motion";

/**
 * Reading-progress rail pinned to the top of the viewport.
 * Decorative, so it is hidden from assistive tech.
 */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 140,
    damping: 26,
    restDelta: 0.001,
  });

  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-[60] h-0.5 origin-left bg-gradient-to-r from-brand-1 via-brand-2 to-brand-3"
    />
  );
}
