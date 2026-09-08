"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

interface SpotlightCardProps extends React.ComponentProps<"div"> {
  /** Disables the pointer tracking (e.g. for static/skeleton states). */
  inert?: boolean;
}

/**
 * Card surface with a highlight that follows the pointer.
 *
 * Position is written straight to CSS custom properties on the element, so the
 * effect costs no React renders — the `.spotlight` utility in globals.css does
 * the painting. Coarse pointers get nothing: there is no hover to track.
 */
export function SpotlightCard({
  className,
  children,
  inert = false,
  ...props
}: SpotlightCardProps) {
  const ref = React.useRef<HTMLDivElement>(null);

  const handlePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (inert || event.pointerType !== "mouse") return;
      const node = ref.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      node.style.setProperty("--mx", `${event.clientX - rect.left}px`);
      node.style.setProperty("--my", `${event.clientY - rect.top}px`);
    },
    [inert]
  );

  return (
    <div
      ref={ref}
      onPointerMove={handlePointerMove}
      className={cn(
        "group/spotlight relative overflow-hidden rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl",
        !inert && "spotlight lift hover:border-primary/35",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
