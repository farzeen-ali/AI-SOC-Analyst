"use client";

import * as React from "react";
import { animate, useInView } from "framer-motion";

import { usePrefersReducedMotion } from "@/lib/hooks/use-client-state";

interface CountUpProps {
  value: number;
  /** Decimal places to render. */
  decimals?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

/**
 * Counts from zero to `value` the first time it scrolls into view.
 *
 * Writes to the DOM node directly rather than through state, so a 1.2s
 * animation does not trigger ~70 React renders. Falls straight to the final
 * value when the visitor prefers reduced motion.
 */
export function CountUp({
  value,
  decimals = 0,
  duration = 1.2,
  prefix = "",
  suffix = "",
  className,
}: CountUpProps) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reducedMotion = usePrefersReducedMotion();

  const format = React.useCallback(
    (n: number) =>
      `${prefix}${n.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}${suffix}`,
    [decimals, prefix, suffix]
  );

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (!inView) return;

    if (reducedMotion) {
      node.textContent = format(value);
      return;
    }

    const controls = animate(0, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        node.textContent = format(latest);
      },
    });

    return () => controls.stop();
  }, [inView, value, duration, reducedMotion, format]);

  // Server render shows the final value so the number is never missing
  // for crawlers or a client that fails to hydrate.
  return (
    <span ref={ref} className={className}>
      {format(value)}
    </span>
  );
}
