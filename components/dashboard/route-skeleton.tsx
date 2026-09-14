import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Shared shape for `loading.tsx` fallbacks.
 *
 * Sized to match the real page so the swap is a paint, not a reflow — the
 * whole point of a skeleton is to hold the layout still while data streams in.
 */
export function RouteSkeleton({
  stats = 4,
  rows = 5,
  maxWidth = "max-w-6xl",
  className,
}: {
  stats?: number;
  rows?: number;
  maxWidth?: string;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full space-y-8", maxWidth, className)}>
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-32 rounded-full" />
          <Skeleton className="h-8 w-64 rounded-lg" />
          <Skeleton className="h-4 w-full max-w-md rounded" />
        </div>
        <Skeleton className="h-9 w-32 shrink-0 rounded-xl" />
      </div>

      {stats > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: stats }, (_, index) => (
            <Skeleton key={index} className="h-[6.5rem] rounded-2xl" />
          ))}
        </div>
      )}

      <div className="space-y-2.5">
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton
            key={index}
            className="h-16 rounded-xl"
            // Fades down the list so the eye reads it as "more below",
            // not as a broken render.
            style={{ opacity: Math.max(0.25, 1 - index * 0.15) }}
          />
        ))}
      </div>
    </div>
  );
}
