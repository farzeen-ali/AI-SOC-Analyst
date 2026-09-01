import type { Metadata } from "next";

import { PageHeader } from "@/components/dashboard/page-header";
import { Reveal } from "@/components/dashboard/reveal";
import { SuspensionToggle } from "@/components/admin/suspension-toggle";
import { setWorkspaceSuspensionAction } from "@/lib/admin/actions";
import { listTenants } from "@/lib/admin/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Tenants" };

export default async function TenantsPage() {
  const tenants = await listTenants();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <PageHeader
        eyebrow="Platform console"
        title="Tenants"
        description="Every workspace on the platform. Suspending a tenant blocks its members at the proxy and strips the workspace claim from newly minted tokens."
      />

      <Reveal>
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl">
          {tenants.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              No workspaces have been provisioned yet.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {tenants.map((tenant) => (
                <li
                  key={tenant.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-1/25 to-brand-2/25 font-heading text-xs font-semibold">
                    {tenant.name.slice(0, 2).toUpperCase()}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {tenant.name}
                      {tenant.is_suspended && (
                        <span className="ml-2 rounded-md border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 font-mono text-[0.55rem] tracking-wide text-destructive uppercase">
                          Suspended
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      /{tenant.slug} · {tenant.ownerEmail ?? "unknown owner"}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-md border border-border/60 bg-muted/50 px-1.5 py-0.5 font-mono text-[0.55rem] tracking-wide text-muted-foreground uppercase">
                      {tenant.memberCount} member
                      {tenant.memberCount === 1 ? "" : "s"}
                    </span>
                    <span
                      className={cn(
                        "rounded-md border px-1.5 py-0.5 font-mono text-[0.55rem] tracking-wide uppercase",
                        tenant.plan === "pro"
                          ? "border-success/30 bg-success/10 text-success"
                          : "border-border/60 bg-muted/50 text-muted-foreground"
                      )}
                    >
                      {tenant.plan}
                    </span>

                    <SuspensionToggle
                      action={setWorkspaceSuspensionAction}
                      id={tenant.id}
                      suspended={tenant.is_suspended}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Reveal>
    </div>
  );
}
