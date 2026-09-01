import type { Metadata } from "next";

import { PageHeader } from "@/components/dashboard/page-header";
import { Reveal } from "@/components/dashboard/reveal";
import { SuspensionToggle } from "@/components/admin/suspension-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { setUserSuspensionAction } from "@/lib/admin/actions";
import { listUsers } from "@/lib/admin/queries";
import { requireSuperAdmin } from "@/lib/auth/dal";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Users" };

function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "GA"
  );
}

export default async function UsersPage() {
  const [actor, users] = await Promise.all([requireSuperAdmin(), listUsers()]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <PageHeader
        eyebrow="Platform console"
        title="Users"
        description="Every account across all tenants. Suspending a user bans their auth record, which force-logs-out every active session immediately."
      />

      <Reveal>
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl">
          {users.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              No accounts yet.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {users.map((user) => {
                const name = user.full_name?.trim() || user.email;
                const isSelf = user.id === actor.userId;

                return (
                  <li
                    key={user.id}
                    className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
                  >
                    <Avatar>
                      {user.avatar_url && (
                        <AvatarImage src={user.avatar_url} alt="" />
                      )}
                      <AvatarFallback className="bg-gradient-to-br from-brand-1/25 to-brand-2/25 text-xs font-semibold text-foreground">
                        {initialsOf(name)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {name}
                        {isSelf && (
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            (you)
                          </span>
                        )}
                        {user.is_suspended && (
                          <span className="ml-2 rounded-md border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 font-mono text-[0.55rem] tracking-wide text-destructive uppercase">
                            Suspended
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {user.email}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={cn(
                          "rounded-md border px-1.5 py-0.5 font-mono text-[0.55rem] tracking-wide uppercase",
                          user.global_role === "super_admin"
                            ? "border-brand-3/40 bg-brand-3/10 text-brand-3"
                            : "border-border/60 bg-muted/50 text-muted-foreground"
                        )}
                      >
                        {user.global_role === "super_admin"
                          ? "Super Admin"
                          : "User"}
                      </span>

                      <SuspensionToggle
                        action={setUserSuspensionAction}
                        id={user.id}
                        suspended={user.is_suspended}
                        disabled={isSelf}
                        disabledReason="Your account"
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Reveal>
    </div>
  );
}
