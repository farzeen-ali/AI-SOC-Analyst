"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface AuthHeaderProps {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
}

export function AuthHeader({ eyebrow, title, description }: AuthHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-2.5"
    >
      {eyebrow && (
        <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 font-mono text-[0.6rem] tracking-[0.16em] text-muted-foreground uppercase">
          <span className="size-1 rounded-full bg-primary" />
          {eyebrow}
        </span>
      )}
      <h1 className="font-heading text-[1.75rem] leading-tight font-semibold tracking-tight">
        {title}
      </h1>
      {description && (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
    </motion.div>
  );
}

/** Horizontal rule with a centred label, used above the OAuth buttons. */
export function AuthDivider({ label = "or" }: { label?: string }) {
  return (
    <div className="relative flex items-center gap-3 py-1">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-border" />
      <span className="font-mono text-[0.65rem] tracking-widest text-muted-foreground uppercase">
        {label}
      </span>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-border" />
    </div>
  );
}
