"use client";

import Link from "next/link";
import { ChevronsUpDownIcon, ShieldIcon, UserCogIcon } from "lucide-react";

import { LogoutForm } from "@/components/dashboard/logout-form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { UserDTO } from "@/lib/auth/dal";
import { cn } from "@/lib/utils";
import { roleLabel } from "@/lib/roles";

/** Avatar dropdown in the top navigation — one of the three sign-out points. */
export function UserMenu({
  user,
  className,
}: {
  user: UserDTO;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "group flex items-center gap-2 rounded-full border border-border/60 bg-card/60 py-1 pr-2 pl-1 backdrop-blur",
          "transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
          className
        )}
        aria-label="Account menu"
      >
        <Avatar size="sm">
          {user.avatarUrl && (
            <AvatarImage src={user.avatarUrl} alt="" />
          )}
          <AvatarFallback className="bg-gradient-to-br from-brand-1/25 to-brand-2/25 text-[0.65rem] font-semibold text-foreground">
            {user.initials}
          </AvatarFallback>
        </Avatar>
        <span className="hidden max-w-28 truncate text-xs font-medium sm:inline">
          {user.fullName}
        </span>
        <ChevronsUpDownIcon className="size-3 text-muted-foreground" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-64">
        {/*
          An identity header, not a group label: Base UI's GroupLabel must live
          inside <Menu.Group>, so a plain div is both correct and semantically
          truer than labelling a group that does not exist.
        */}
        <div className="px-2 py-2">
          <div className="flex items-center gap-2.5">
            <Avatar>
              {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
              <AvatarFallback className="bg-gradient-to-br from-brand-1/25 to-brand-2/25 text-xs font-semibold text-foreground">
                {user.initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {user.fullName}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user.email}
              </p>
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-md border border-primary/25 bg-primary/10 px-1.5 py-0.5 font-mono text-[0.6rem] tracking-wide text-primary uppercase">
              <ShieldIcon className="size-2.5" />
              {roleLabel(user)}
            </span>
            {user.workspaceName && (
              <span className="max-w-32 truncate rounded-md border border-border/60 bg-muted/60 px-1.5 py-0.5 font-mono text-[0.6rem] text-muted-foreground">
                {user.workspaceName}
              </span>
            )}
          </div>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem nativeButton={false} render={<Link href="/settings/profile" />}>
          <UserCogIcon className="size-4" />
          Profile &amp; security
        </DropdownMenuItem>

        {user.isSuperAdmin && (
          <DropdownMenuItem nativeButton={false} render={<Link href="/super-admin" />}>
            <ShieldIcon className="size-4" />
            Platform console
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        <LogoutForm variant="menu" />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
