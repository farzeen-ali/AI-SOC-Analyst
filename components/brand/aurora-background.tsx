import { cn } from "@/lib/utils";

interface AuroraBackgroundProps {
  className?: string;
  /** Softer, lower-contrast variant for content-dense screens. */
  subtle?: boolean;
}

/**
 * Ambient page backdrop: three drifting colour fields over a fading grid.
 *
 * Purely decorative and non-interactive — it sits behind everything with
 * `pointer-events-none`, and the drift animation is suppressed by the global
 * `prefers-reduced-motion` rule in `globals.css`.
 */
export function AuroraBackground({
  className,
  subtle = false,
}: AuroraBackgroundProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 overflow-hidden",
        className
      )}
    >
      <div className="absolute inset-0 grid-bg mask-fade-b" />

      <div
        className={cn(
          "absolute -top-40 -left-32 size-[38rem] rounded-full blur-3xl animate-aurora",
          "bg-[radial-gradient(circle_at_center,var(--brand-1),transparent_65%)]",
          subtle ? "opacity-15" : "opacity-30"
        )}
      />
      <div
        className={cn(
          "absolute -top-24 right-[-10rem] size-[34rem] rounded-full blur-3xl animate-aurora",
          "bg-[radial-gradient(circle_at_center,var(--brand-2),transparent_65%)]",
          subtle ? "opacity-15" : "opacity-30"
        )}
        style={{ animationDelay: "-6s" }}
      />
      <div
        className={cn(
          "absolute bottom-[-16rem] left-1/3 size-[32rem] rounded-full blur-3xl animate-aurora",
          "bg-[radial-gradient(circle_at_center,var(--brand-3),transparent_65%)]",
          subtle ? "opacity-10" : "opacity-25"
        )}
        style={{ animationDelay: "-12s" }}
      />

      {/* Vignette keeps text legible where the fields overlap. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,var(--background)_88%)]" />
    </div>
  );
}
