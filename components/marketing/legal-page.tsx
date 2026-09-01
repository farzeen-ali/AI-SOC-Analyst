import { FileTextIcon } from "lucide-react";
import type { ReactNode } from "react";

import { AuroraBackground } from "@/components/brand/aurora-background";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";

interface LegalPageProps {
  title: string;
  intro: string;
  sections: Array<{ heading: string; body: ReactNode }>;
}

/**
 * Shared shell for the policy pages.
 *
 * These carry a placeholder notice on purpose: the operative wording for a
 * real deployment has to come from the operator's counsel, not from this
 * scaffold.
 */
export function LegalPage({ title, intro, sections }: LegalPageProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <section className="relative px-6 pt-32 pb-16 sm:pt-40">
        <AuroraBackground subtle />

        <div className="mx-auto max-w-3xl space-y-5">
          <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1.5 font-mono text-[0.65rem] tracking-[0.14em] text-muted-foreground uppercase backdrop-blur">
            <FileTextIcon className="size-3 text-primary" />
            {title}
          </span>
          <h1 className="font-heading text-4xl font-semibold tracking-tight">
            {title}
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground">
            {intro}
          </p>

          <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
            This page is a structural placeholder. Replace it with wording
            reviewed by your own legal counsel before operating GuardAI in
            production.
          </div>
        </div>
      </section>

      <section className="px-6 pb-24">
        <div className="mx-auto max-w-3xl space-y-8">
          {sections.map((section) => (
            <article key={section.heading} className="space-y-2">
              <h2 className="font-heading text-lg font-semibold">
                {section.heading}
              </h2>
              <div className="text-sm leading-relaxed text-muted-foreground">
                {section.body}
              </div>
            </article>
          ))}
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
