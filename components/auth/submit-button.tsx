"use client";

import { useFormStatus } from "react-dom";
import { Loader2Icon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SubmitButtonProps {
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Primary form submit. Reads `useFormStatus` so it disables itself for the
 * duration of the Server Action without the page needing to thread state down.
 */
export function SubmitButton({
  children,
  pendingLabel = "Working…",
  className,
  disabled,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      size="lg"
      disabled={pending || disabled}
      aria-busy={pending}
      className={cn(
        "group relative h-11 w-full overflow-hidden rounded-xl text-sm font-semibold",
        "bg-gradient-to-r from-brand-1 via-primary to-brand-2 text-primary-foreground",
        "shadow-lg shadow-primary/20 transition-all duration-300",
        "hover:shadow-xl hover:shadow-primary/30 hover:brightness-110",
        "disabled:opacity-70 disabled:shadow-none",
        className
      )}
    >
      {/* Sheen sweep on hover. */}
      <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      <span className="relative flex items-center justify-center gap-2">
        {pending && <Loader2Icon className="size-4 animate-spin" />}
        {pending ? pendingLabel : children}
      </span>
    </Button>
  );
}
