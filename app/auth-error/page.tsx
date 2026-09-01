import type { Metadata } from "next";
import Link from "next/link";
import { ShieldXIcon } from "lucide-react";

import { AuroraBackground } from "@/components/brand/aurora-background";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Sign-in problem",
  robots: { index: false, follow: false },
};

const REASONS: Record<string, string> = {
  "missing-code": "The sign-in link was incomplete or had already been used.",
  "exchange-failed":
    "We could not complete that sign-in. The link may have expired.",
  otp_expired: "That link has expired. Request a fresh one to continue.",
  access_denied: "Sign-in was cancelled before it finished.",
};

export default async function AuthErrorPage(props: PageProps<"/auth-error">) {
  const searchParams = await props.searchParams;
  const raw = Array.isArray(searchParams.reason)
    ? searchParams.reason[0]
    : searchParams.reason;

  const description =
    (raw && REASONS[raw]) ??
    "We could not complete that sign-in. Please try again.";

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <AuroraBackground subtle />

      <div className="w-full max-w-md space-y-8 text-center">
        <div className="flex justify-center">
          <Logo href="/" />
        </div>

        <div className="flex justify-center">
          <span className="flex size-16 items-center justify-center rounded-2xl border border-destructive/25 bg-destructive/10">
            <ShieldXIcon className="size-7 text-destructive" />
          </span>
        </div>

        <div className="space-y-2.5">
          <h1 className="font-heading text-2xl font-semibold">
            We could not sign you in
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button
            size="lg"
            className="h-11 rounded-xl"
            nativeButton={false}
            render={<Link href="/login" />}
          >
            Back to sign in
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-11 rounded-xl"
            nativeButton={false}
            render={<Link href="/forgot-password" />}
          >
            Reset password
          </Button>
        </div>
      </div>
    </main>
  );
}
