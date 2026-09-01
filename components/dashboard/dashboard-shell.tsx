"use client";

import * as React from "react";
import Link from "next/link";
import { MenuIcon, SparklesIcon } from "lucide-react";

import { LogoutForm } from "@/components/dashboard/logout-form";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { UserMenu } from "@/components/dashboard/user-menu";
import { Logo } from "@/components/brand/logo";
import { ThemeToggleButton } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { UserDTO } from "@/lib/auth/dal";
import { filterNav, SUPER_ADMIN_NAV, WORKSPACE_NAV } from "@/lib/navigation";
import { roleLabel } from "@/lib/roles";
import { cn } from "@/lib/utils";

interface DashboardShellProps {
  user: UserDTO;
  variant?: "workspace" | "super-admin";
  children: React.ReactNode;
}

/**
 * Application chrome for every authenticated screen.
 *
 * Nav sections are filtered client-side from the serialisable `UserDTO` (icon
 * components cannot cross the server/client boundary). The routes themselves
 * still enforce access — see `requireTenantAdmin` / `requireSuperAdmin`.
 */
export function DashboardShell({
  user,
  variant = "workspace",
  children,
}: DashboardShellProps) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const sections = React.useMemo(
    () =>
      filterNav(
        variant === "super-admin" ? SUPER_ADMIN_NAV : WORKSPACE_NAV,
        user
      ),
    [variant, user]
  );

  const sidebarBody = (
    <div className="flex h-full flex-col gap-6">
      <WorkspaceBadge user={user} variant={variant} />
      <div className="flex-1 overflow-y-auto">
        <SidebarNav
          sections={sections}
          onNavigate={() => setMobileOpen(false)}
        />
      </div>
      <div className="space-y-2 border-t border-border/60 pt-3">
        {!user.isSuperAdmin && user.isTenantAdmin && (
          <UpgradeCard plan={user.workspacePlan} />
        )}
        {/* Sign-out point 2 of 3: sidebar footer. */}
        <LogoutForm variant="sidebar" />
      </div>
    </div>
  );

  return (
    <div className="relative flex min-h-screen w-full bg-background">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 dot-bg opacity-60"
      />

      {/* ---------------- Desktop sidebar ---------------- */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border/60 bg-sidebar/70 p-4 backdrop-blur-xl lg:flex">
        <div className="mb-6 px-1">
          <Logo
            href={user.isSuperAdmin ? "/super-admin" : "/dashboard"}
            tagline={variant === "super-admin" ? "Platform" : "SOC Console"}
          />
        </div>
        {sidebarBody}
      </aside>

      {/* ---------------- Main column ---------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl sm:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  aria-label="Open navigation"
                />
              }
            >
              <MenuIcon className="size-4" />
            </SheetTrigger>

            <SheetContent side="left" className="w-72 p-4">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SheetDescription className="sr-only">
                Workspace and account navigation
              </SheetDescription>
              <div className="mb-6">
                <Logo
                  href={user.isSuperAdmin ? "/super-admin" : "/dashboard"}
                  tagline={
                    variant === "super-admin" ? "Platform" : "SOC Console"
                  }
                />
              </div>
              {sidebarBody}
            </SheetContent>
          </Sheet>

          <Logo showWordmark={false} href="/dashboard" className="lg:hidden" />

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-2.5 py-1 font-mono text-[0.6rem] tracking-wide text-muted-foreground uppercase sm:inline-flex">
              <span className="size-1.5 rounded-full bg-success" />
              {roleLabel(user)}
            </span>
            <ThemeToggleButton />
            {/* Sign-out point 1 of 3: avatar dropdown. */}
            <UserMenu user={user} />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function WorkspaceBadge({
  user,
  variant,
}: {
  user: UserDTO;
  variant: "workspace" | "super-admin";
}) {
  const title =
    variant === "super-admin"
      ? "Platform Console"
      : (user.workspaceName ?? "No workspace");
  const subtitle =
    variant === "super-admin"
      ? "All tenants"
      : user.workspacePlan
        ? `${user.workspacePlan.toUpperCase()} plan`
        : "Unassigned";

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-card/60 px-2.5 py-2">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg font-heading text-xs font-semibold",
          variant === "super-admin"
            ? "bg-gradient-to-br from-brand-3/25 to-brand-2/25 text-foreground"
            : "bg-gradient-to-br from-brand-1/25 to-brand-2/25 text-foreground"
        )}
      >
        {title.slice(0, 2).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate font-mono text-[0.6rem] tracking-wide text-muted-foreground uppercase">
          {subtitle}
        </p>
      </div>
    </div>
  );
}

function UpgradeCard({ plan }: { plan: string | null }) {
  if (plan === "pro") return null;

  return (
    <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 to-brand-2/10 p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium">
        <SparklesIcon className="size-3.5 text-primary" />
        Free plan
      </p>
      <p className="mt-1 text-[0.7rem] leading-relaxed text-muted-foreground">
        Unlock unlimited log ingestion and full retention on Pro.
      </p>
      <Button
        size="sm"
        className="mt-2.5 h-7 w-full rounded-lg text-xs"
        nativeButton={false}
        render={<Link href="/dashboard/billing" />}
      >
        Compare plans
      </Button>
    </div>
  );
}
