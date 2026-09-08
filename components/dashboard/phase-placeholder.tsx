import type { LucideIcon } from "lucide-react";

import { Reveal } from "@/components/motion/reveal";

interface PhasePlaceholderProps {
  icon: LucideIcon;
  phase: string;
  title: string;
  description: string;
  bullets: string[];
}

/**
 * Honest stand-in for a screen whose feature work lands in a later phase.
 * The route, its role guard, and its navigation entry are real — only the
 * feature body is pending.
 */
export function PhasePlaceholder({
  icon: Icon,
  phase,
  title,
  description,
  bullets,
}: PhasePlaceholderProps) {
  return (
    <Reveal>
      <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/70 p-8 text-center backdrop-blur-xl">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 grid-bg opacity-50 mask-radial"
        />

        <div className="relative mx-auto max-w-lg space-y-5">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10">
            <Icon className="size-6 text-primary" />
          </span>

          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 font-mono text-[0.6rem] tracking-[0.16em] text-muted-foreground uppercase">
              {phase}
            </span>
            <h2 className="font-heading text-xl font-semibold">{title}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>

          <ul className="mx-auto grid max-w-md gap-2 text-left">
            {bullets.map((bullet) => (
              <li
                key={bullet}
                className="flex items-start gap-2 rounded-lg border border-border/50 bg-background/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground"
              >
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" />
                {bullet}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </Reveal>
  );
}
