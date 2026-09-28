"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ClockIcon, Loader2Icon, MailIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { revokeInvitationAction } from "@/lib/team/actions";
import type { PendingInvitation } from "@/lib/team/invitations";

function expiresIn(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 24) return `${Math.floor(hours / 24)}d left`;
  if (hours >= 1) return `${hours}h left`;
  return `${Math.max(1, Math.round(ms / 60_000))}m left`;
}

/**
 * Outstanding invitations, with one-click revocation.
 *
 * Revoking matters as much as inviting: an invitation link is a credential,
 * and an admin who sent one to the wrong address needs to be able to kill it
 * without waiting 72 hours for the expiry.
 */
export function PendingInvitations({
  invitations,
}: {
  invitations: PendingInvitation[];
}) {
  const [revoking, setRevoking] = React.useState<string | null>(null);
  const [removed, setRemoved] = React.useState<string[]>([]);

  const visible = invitations.filter((row) => !removed.includes(row.id));

  if (visible.length === 0) return null;

  function revoke(id: string) {
    setRevoking(id);

    void (async () => {
      const payload = new FormData();
      payload.set("id", id);
      const result = await revokeInvitationAction(undefined, payload);

      if (result.ok) {
        setRemoved((current) => [...current, id]);
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
      setRevoking(null);
    })();
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
        <ClockIcon className="size-3.5 text-warning" />
        <h2 className="text-xs font-semibold tracking-tight">
          Pending invitations
        </h2>
        <span className="ml-auto font-mono text-[0.6rem] tracking-wider text-muted-foreground uppercase">
          {visible.length} outstanding
        </span>
      </div>

      <ul className="divide-y divide-border/60">
        <AnimatePresence initial={false}>
          {visible.map((invitation) => (
            <motion.li
              key={invitation.id}
              layout
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22 }}
              className="flex items-center gap-3 px-4 py-2.5"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-warning/25 bg-warning/10">
                <MailIcon className="size-3.5 text-warning" />
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{invitation.email}</p>
                <p className="font-mono text-[0.65rem] text-muted-foreground">
                  {expiresIn(invitation.expiresAt)}
                </p>
              </div>

              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Revoke invitation for ${invitation.email}`}
                disabled={revoking === invitation.id}
                onClick={() => revoke(invitation.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                {revoking === invitation.id ? (
                  <Loader2Icon className="size-3.5 animate-spin" />
                ) : (
                  <XIcon className="size-3.5" />
                )}
              </Button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
