"use client";

import { useFormStatus } from "react-dom";
import { Loader2Icon, LogOutIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { logoutAction } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

/**
 * Sign-out control.
 *
 * The Server Action revokes the refresh token globally, clears the `sb-*`
 * cookies, invalidates the route cache, and redirects — so the three
 * placements below (avatar menu, sidebar footer, profile settings) all
 * terminate the session identically.
 */

function LogoutPending({
  children,
  className,
  variant,
}: {
  children: React.ReactNode;
  className?: string;
  variant: "menu" | "sidebar" | "button";
}) {
  const { pending } = useFormStatus();

  const icon = pending ? (
    <Loader2Icon className="size-4 animate-spin" />
  ) : (
    <LogOutIcon className="size-4" />
  );

  if (variant === "menu") {
    return (
      <DropdownMenuItem
        variant="destructive"
        disabled={pending}
        closeOnClick={false}
        nativeButton
        render={<button type="submit" />}
        className={cn("w-full", className)}
      >
        {icon}
        {pending ? "Signing out…" : children}
      </DropdownMenuItem>
    );
  }

  if (variant === "sidebar") {
    return (
      <button
        type="submit"
        disabled={pending}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-colors",
          "hover:bg-destructive/10 hover:text-destructive",
          "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
          "disabled:pointer-events-none disabled:opacity-60",
          className
        )}
      >
        {icon}
        {pending ? "Signing out…" : children}
      </button>
    );
  }

  return (
    <Button
      type="submit"
      variant="destructive"
      size="lg"
      disabled={pending}
      className={cn("h-10 rounded-xl", className)}
    >
      {icon}
      {pending ? "Signing out…" : children}
    </Button>
  );
}

interface LogoutFormProps {
  variant?: "menu" | "sidebar" | "button";
  label?: string;
  className?: string;
}

export function LogoutForm({
  variant = "button",
  label = "Sign out",
  className,
}: LogoutFormProps) {
  return (
    <form action={logoutAction} className={variant === "menu" ? "" : "w-full"}>
      <LogoutPending variant={variant} className={className}>
        {label}
      </LogoutPending>
    </form>
  );
}
