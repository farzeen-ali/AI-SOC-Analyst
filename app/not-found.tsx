import Link from "next/link";
import { CompassIcon } from "lucide-react";

import { AuroraBackground } from "@/components/brand/aurora-background";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <AuroraBackground subtle />

      <div className="w-full max-w-md space-y-8 text-center">
        <div className="flex justify-center">
          <Logo href="/" />
        </div>

        <p className="font-heading text-7xl font-semibold tracking-tight text-gradient">
          404
        </p>

        <div className="space-y-2.5">
          <h1 className="font-heading text-2xl font-semibold">
            Nothing to triage here
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            That page does not exist, or it belongs to a workspace you cannot
            reach.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button
            size="lg"
            className="h-11 rounded-xl"
            nativeButton={false}
            render={<Link href="/" />}
          >
            <CompassIcon className="size-4" />
            Back to home
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-11 rounded-xl"
            nativeButton={false}
            render={<Link href="/dashboard" />}
          >
            Go to dashboard
          </Button>
        </div>
      </div>
    </main>
  );
}
