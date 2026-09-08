import type { Metadata } from "next";

import { PageHeader } from "@/components/dashboard/page-header";
import { Reveal } from "@/components/motion/reveal";
import { listAuditLogs } from "@/lib/admin/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Audit Logs" };

/** Tone by action family so a scan of the list surfaces failures quickly. */
function toneFor(action: string) {
  if (action.includes("failed") || action.includes("locked")) {
    return "border-destructive/30 bg-destructive/10 text-destructive";
  }
  if (action.startsWith("admin.")) {
    return "border-brand-3/40 bg-brand-3/10 text-brand-3";
  }
  if (action.includes("rate_limited")) {
    return "border-warning/30 bg-warning/10 text-warning";
  }
  return "border-border/60 bg-muted/50 text-muted-foreground";
}

export default async function AuditPage() {
  const logs = await listAuditLogs();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <PageHeader
        eyebrow="Platform console"
        title="Audit Logs"
        description="Authentication events and administrative actions across every tenant. Written through the service role — nothing client-reachable can forge an entry."
      />

      <Reveal>
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl">
          {logs.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              No audit events recorded yet.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {logs.map((log) => (
                <li
                  key={log.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 transition-colors hover:bg-muted/30"
                >
                  <span
                    className={cn(
                      "shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[0.6rem] tracking-wide",
                      toneFor(log.action)
                    )}
                  >
                    {log.action}
                  </span>

                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {log.actorEmail ?? "anonymous"}
                    {log.target_type && ` → ${log.target_type}`}
                  </span>

                  <span className="shrink-0 font-mono text-[0.65rem] text-muted-foreground/70">
                    {log.ip_address ?? "—"}
                  </span>

                  <time
                    dateTime={log.created_at}
                    className="shrink-0 font-mono text-[0.65rem] text-muted-foreground/70"
                  >
                    {new Date(log.created_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Reveal>
    </div>
  );
}
