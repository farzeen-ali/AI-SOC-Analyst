"use client";

import * as React from "react";
import Link from "next/link";
import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Route-level error boundary.
 *
 * Catches anything a page or Server Action throws — including a misconfigured
 * environment — and shows a recoverable screen instead of a blank page. The
 * underlying message is logged, never rendered, so internals stay server-side.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[guardai] unhandled route error", error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-md space-y-7 text-center">
        <div className="flex justify-center">
          <span className="flex size-14 items-center justify-center rounded-2xl border border-destructive/25 bg-destructive/10">
            <TriangleAlertIcon className="size-6 text-destructive" />
          </span>
        </div>

        <div className="space-y-2.5">
          <h1 className="font-heading text-2xl font-semibold">
            Something went wrong
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            We hit an unexpected error handling that request. Try again — if it
            keeps happening, contact your workspace administrator.
          </p>
          {error.digest && (
            <p className="font-mono text-[0.65rem] text-muted-foreground/70">
              Reference: {error.digest}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button size="lg" className="h-11 rounded-xl" onClick={reset}>
            <RefreshCwIcon className="size-4" />
            Try again
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-11 rounded-xl"
            nativeButton={false}
            render={<Link href="/" />}
          >
            Back to home
          </Button>
        </div>
      </div>
    </main>
  );
}
