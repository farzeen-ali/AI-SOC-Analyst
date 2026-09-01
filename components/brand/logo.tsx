import Link from "next/link";

import { cn } from "@/lib/utils";

interface LogoMarkProps {
  className?: string;
  animated?: boolean;
}

/**
 * GuardAI shield mark. The inner circuit path is stroke-dashed and animates
 * like a scan sweep when `animated` is set.
 */
export function LogoMark({ className, animated = true }: LogoMarkProps) {
  return (
    <span
      className={cn(
        "relative inline-flex size-9 shrink-0 items-center justify-center rounded-xl",
        "bg-gradient-to-br from-brand-1/25 via-brand-2/20 to-brand-3/25",
        "ring-1 ring-inset ring-brand-1/30",
        className
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="size-5"
      >
        <defs>
          <linearGradient id="guardai-shield" x1="0" y1="0" x2="24" y2="24">
            <stop offset="0%" stopColor="var(--brand-1)" />
            <stop offset="55%" stopColor="var(--brand-2)" />
            <stop offset="100%" stopColor="var(--brand-3)" />
          </linearGradient>
        </defs>
        <path
          d="M12 2.5 4.5 5.6v6.1c0 4.7 3.1 8.3 7.5 9.8 4.4-1.5 7.5-5.1 7.5-9.8V5.6L12 2.5Z"
          stroke="url(#guardai-shield)"
          strokeWidth="1.6"
          strokeLinejoin="round"
          fill="none"
        />
        <path
          d="M8.6 12.1h2l1.2-2.4 1.5 4.2 1.1-1.8h1.9"
          stroke="url(#guardai-shield)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          className={cn(
            animated && "[stroke-dasharray:22] [stroke-dashoffset:0]",
            animated && "animate-pulse"
          )}
        />
      </svg>
    </span>
  );
}

interface LogoProps {
  className?: string;
  href?: string | null;
  showWordmark?: boolean;
  tagline?: string;
}

export function Logo({
  className,
  href = "/",
  showWordmark = true,
  tagline,
}: LogoProps) {
  const content = (
    <span className={cn("group inline-flex items-center gap-2.5", className)}>
      <LogoMark className="transition-transform duration-300 group-hover:scale-105" />
      {showWordmark && (
        <span className="flex flex-col leading-none">
          <span className="font-heading text-[1.05rem] font-semibold tracking-tight">
            Guard<span className="text-gradient">AI</span>
          </span>
          {tagline && (
            <span className="mt-0.5 font-mono text-[0.6rem] tracking-[0.18em] text-muted-foreground uppercase">
              {tagline}
            </span>
          )}
        </span>
      )}
    </span>
  );

  if (!href) return content;

  return (
    <Link href={href} aria-label="GuardAI home" className="inline-flex">
      {content}
    </Link>
  );
}
