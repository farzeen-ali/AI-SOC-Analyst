import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon, InboxIcon } from "lucide-react";

import { AuthHeader } from "@/components/auth/auth-header";
import { sanitizeEmail } from "@/lib/security/sanitize";
import { EMAIL_REGEX } from "@/lib/validations/auth";

export const metadata: Metadata = {
  title: "Confirm your email",
  description: "Confirm your email address to activate your GuardAI workspace.",
};

export default async function CheckEmailPage(props: PageProps<"/check-email">) {
  const searchParams = await props.searchParams;
  const candidate = sanitizeEmail(searchParams.email);
  const email = EMAIL_REGEX.test(candidate) ? candidate : null;

  return (
    <div className="space-y-7">
      <div className="flex justify-center">
        <span className="relative flex size-16 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10">
          <span
            aria-hidden="true"
            className="absolute inset-0 animate-pulse-ring rounded-2xl border border-primary/40"
          />
          <InboxIcon className="size-7 text-primary" />
        </span>
      </div>

      <div className="text-center">
        <AuthHeader
          title="Confirm your email"
          description={
            email ? (
              <>
                We sent a confirmation link to{" "}
                <span className="font-medium text-foreground">{email}</span>.
                Open it to activate your workspace and sign in.
              </>
            ) : (
              "We sent you a confirmation link. Open it to activate your workspace and sign in."
            )
          }
        />
      </div>

      <ol className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-4">
        {[
          "Open the email from GuardAI.",
          "Click “Confirm your email”.",
          "You will land in your new workspace as Tenant Admin.",
        ].map((step, index) => (
          <li key={step} className="flex items-start gap-3 text-sm">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 font-mono text-[0.65rem] font-semibold text-primary">
              {index + 1}
            </span>
            <span className="text-muted-foreground">{step}</span>
          </li>
        ))}
      </ol>

      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        No email after a few minutes? Check your spam folder, or{" "}
        <Link
          href="/signup"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          try signing up again
        </Link>
        .
      </p>

      <Link
        href="/login"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeftIcon className="size-3.5" />
        Back to sign in
      </Link>
    </div>
  );
}
