import type { Metadata } from "next";
import { CrownIcon, MailPlusIcon, ShieldIcon, UsersIcon } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { Reveal } from "@/components/dashboard/reveal";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { requireTenantAdmin } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Team" };

interface MemberRow {
  user_id: string;
  workspace_role: "tenant_admin" | "member";
  created_at: string;
  profiles: {
    email: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "GA"
  );
}

/**
 * Tenant Admin only. Members are redirected by `requireTenantAdmin()` before
 * this component renders, and the underlying query is additionally constrained
 * by the `members: read own tenant` RLS policy.
 */
export default async function TeamPage() {
  const context = await requireTenantAdmin();
  const supabase = await createClient();

  const { data, error } = context.workspace
    ? await supabase
        .from("workspace_members")
        .select(
          "user_id, workspace_role, created_at, profiles(email, full_name, avatar_url)"
        )
        .eq("workspace_id", context.workspace.id)
        .order("created_at", { ascending: true })
    : { data: [], error: null };

  const members = (data ?? []) as unknown as MemberRow[];
  const seats = context.workspace?.seats ?? 0;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Team"
        description={`Analysts with access to ${context.workspace?.name ?? "this workspace"}. Only Tenant Admins can see or change this list.`}
        action={
          <Button className="h-9 rounded-xl" disabled>
            <MailPlusIcon className="size-4" />
            Invite analyst
          </Button>
        }
      />

      <Reveal>
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-card/70 px-4 py-3 backdrop-blur-xl">
          <UsersIcon className="size-4 text-primary" />
          <p className="text-sm">
            <span className="font-semibold">{members.length}</span>
            <span className="text-muted-foreground">
              {" "}
              of {seats} seat{seats === 1 ? "" : "s"} used
            </span>
          </p>
          <span className="ml-auto rounded-md border border-border/60 bg-muted/50 px-2 py-0.5 font-mono text-[0.6rem] tracking-wide text-muted-foreground uppercase">
            Invitations ship in Phase 2
          </span>
        </div>
      </Reveal>

      <Reveal index={1}>
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl">
          {error && (
            <p className="px-4 py-6 text-sm text-destructive">
              Could not load team members: {error.message}
            </p>
          )}

          {!error && members.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              No members yet.
            </p>
          )}

          <ul className="divide-y divide-border/60">
            {members.map((member) => {
              const name =
                member.profiles?.full_name?.trim() ||
                member.profiles?.email ||
                "Unknown analyst";
              const isAdmin = member.workspace_role === "tenant_admin";
              const isOwner = context.workspace?.owner_id === member.user_id;

              return (
                <li
                  key={member.user_id}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
                >
                  <Avatar>
                    {member.profiles?.avatar_url && (
                      <AvatarImage src={member.profiles.avatar_url} alt="" />
                    )}
                    <AvatarFallback className="bg-gradient-to-br from-brand-1/25 to-brand-2/25 text-xs font-semibold text-foreground">
                      {initialsOf(name)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {name}
                      {member.user_id === context.userId && (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          (you)
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {member.profiles?.email}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {isOwner && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-warning/30 bg-warning/10 px-1.5 py-0.5 font-mono text-[0.55rem] tracking-wide text-warning uppercase">
                        <CrownIcon className="size-2.5" />
                        Owner
                      </span>
                    )}
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[0.55rem] tracking-wide uppercase",
                        isAdmin
                          ? "border-primary/25 bg-primary/10 text-primary"
                          : "border-border/60 bg-muted/50 text-muted-foreground"
                      )}
                    >
                      <ShieldIcon className="size-2.5" />
                      {isAdmin ? "Tenant Admin" : "SOC Analyst"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </Reveal>
    </div>
  );
}
