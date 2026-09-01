"use client";

import * as React from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.87c2.26-2.09 3.56-5.17 3.56-8.87Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.87-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.28v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.28a12 12 0 0 0 0 10.76l3.99-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.62l3.99 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

interface GoogleButtonProps {
  label?: string;
  /** Where to land after the callback completes. */
  next?: string;
  className?: string;
}

/**
 * Starts the Google OAuth flow.
 *
 * Supabase redirects back to `/auth/callback`, which exchanges the code and
 * routes by role. First-time Google users get a workspace auto-provisioned by
 * the `on_auth_user_created` trigger, with themselves as Tenant Admin.
 */
export function GoogleButton({
  label = "Continue with Google",
  next,
  className,
}: GoogleButtonProps) {
  const [pending, setPending] = React.useState(false);

  async function handleClick() {
    setPending(true);
    try {
      const supabase = createClient();
      const callback = new URL("/auth/callback", window.location.origin);
      if (next) callback.searchParams.set("next", next);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callback.toString(),
          queryParams: { access_type: "offline", prompt: "consent" },
        },
      });

      if (error) {
        setPending(false);
        toast.error("Could not reach Google", { description: error.message });
      }
      // On success the browser navigates away; keep the pending state.
    } catch (error) {
      setPending(false);
      toast.error("Could not start Google sign-in", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      onClick={handleClick}
      disabled={pending}
      className={cn(
        "h-11 w-full rounded-xl border-border/70 bg-background/60 text-sm font-medium",
        "transition-all duration-200 hover:border-border hover:bg-muted/60",
        className
      )}
    >
      {pending ? (
        <Loader2Icon className="size-4 animate-spin" />
      ) : (
        <GoogleGlyph />
      )}
      {pending ? "Redirecting…" : label}
    </Button>
  );
}
