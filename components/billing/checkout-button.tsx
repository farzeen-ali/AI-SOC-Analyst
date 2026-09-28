"use client";

import * as React from "react";
import {
  ArrowRightIcon,
  ExternalLinkIcon,
  Loader2Icon,
  SparklesIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  createCheckoutSessionAction,
  createPortalSessionAction,
} from "@/lib/billing/actions";
import { cn } from "@/lib/utils";

type Mode = "checkout" | "portal";

interface CheckoutButtonProps {
  mode?: Mode;
  label?: string;
  pendingLabel?: string;
  disabled?: boolean;
  variant?: "gradient" | "outline" | "ghost";
  size?: "default" | "lg";
  className?: string;
}

/**
 * Sends the browser to a Stripe-hosted page.
 *
 * The URL is minted server-side per click and is single-use, so it is never
 * embedded in the markup — a checkout link sitting in the HTML would be a
 * session anyone with the page source could resume. `window.location.assign`
 * rather than the router: Stripe is a different origin, so a client-side
 * navigation is not an option.
 */
export function CheckoutButton({
  mode = "checkout",
  label,
  pendingLabel,
  disabled,
  variant = "gradient",
  size = "default",
  className,
}: CheckoutButtonProps) {
  const [pending, startTransition] = React.useTransition();

  const defaults =
    mode === "checkout"
      ? { label: "Upgrade to Pro", pending: "Opening Stripe…" }
      : { label: "Manage subscription", pending: "Opening portal…" };

  function handleClick() {
    startTransition(async () => {
      const action =
        mode === "checkout"
          ? createCheckoutSessionAction
          : createPortalSessionAction;

      const result = await action();

      if (result.ok && result.url) {
        window.location.assign(result.url);
        return;
      }

      toast.error(
        mode === "checkout"
          ? "Could not start checkout"
          : "Could not open the portal",
        { description: result.message }
      );
    });
  }

  return (
    <Button
      type="button"
      onClick={handleClick}
      disabled={pending || disabled}
      className={cn(
        "group relative overflow-hidden rounded-xl font-medium",
        size === "lg" ? "h-12 px-6 text-base" : "h-10 px-4",
        variant === "gradient" &&
          "bg-gradient-to-r from-brand-1 via-primary to-brand-2 text-primary-foreground shadow-lg shadow-primary/20",
        className
      )}
      variant={variant === "gradient" ? "default" : variant}
    >
      {/* Sheen sweep on hover — pure CSS, no layout cost. */}
      {variant === "gradient" && (
        <span
          aria-hidden="true"
          className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full"
        />
      )}

      <span className="relative flex items-center gap-2">
        {pending ? (
          <Loader2Icon className="size-4 animate-spin" />
        ) : mode === "checkout" ? (
          <SparklesIcon className="size-4" />
        ) : (
          <ExternalLinkIcon className="size-4" />
        )}
        {pending
          ? (pendingLabel ?? defaults.pending)
          : (label ?? defaults.label)}
        {!pending && mode === "checkout" && (
          <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
        )}
      </span>
    </Button>
  );
}
