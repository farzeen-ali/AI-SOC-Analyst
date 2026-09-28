"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  CheckIcon,
  ClockIcon,
  CopyIcon,
  LinkIcon,
  Loader2Icon,
  MailPlusIcon,
  SendIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inviteMemberAction } from "@/lib/team/actions";
import { cn } from "@/lib/utils";

function SubmitInvite({ pending }: { pending: boolean }) {
  return (
    <Button
      type="submit"
      disabled={pending}
      className="h-9 rounded-xl bg-gradient-to-r from-brand-1 to-brand-2 text-primary-foreground"
    >
      {pending ? (
        <Loader2Icon className="size-4 animate-spin" />
      ) : (
        <SendIcon className="size-4" />
      )}
      {pending ? "Generating…" : "Create invitation"}
    </Button>
  );
}

/**
 * Tenant Admin invite dialog.
 *
 * Rendered only in the Tenant Admin view, but that is presentation — the
 * action re-checks the role, the seat limit and the rate limit on the server,
 * so hiding the button is never what enforces the rule.
 *
 * The result is a one-time link rather than a "sent!" toast. The admin sees
 * exactly what the invitee will receive and can deliver it through whatever
 * channel they already trust, which also means the flow does not depend on
 * an email provider being configured.
 */
export function InviteModal({
  seatsUsed,
  seats,
  className,
}: {
  seatsUsed: number;
  seats: number;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [invite, setInvite] = React.useState<{
    email: string;
    url: string;
  } | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  /**
   * Called from the submit handler rather than through `useActionState`, so
   * the toast and the state change happen in the event that caused them
   * instead of in an effect reacting to state.
   */
  function handleSubmit(formData: FormData) {
    setError(null);
    setCopied(false);

    const email = String(formData.get("email") ?? "");

    startTransition(async () => {
      const result = await inviteMemberAction(undefined, formData);

      if (result.ok && result.inviteUrl) {
        setInvite({ email, url: result.inviteUrl });
        toast.success(result.message, {
          description: "Copy the link and send it to them.",
        });
      } else {
        setError(result.message);
        toast.error(result.message);
      }
    });
  }

  function reset() {
    setInvite(null);
    setError(null);
    setCopied(false);
  }

  async function copyLink() {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.url);
      setCopied(true);
      toast.success("Invitation link copied");
    } catch {
      toast.error("Could not copy — select the link and copy it manually.");
    }
  }

  const seatsLeft = Math.max(0, seats - seatsUsed);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" className={cn("h-9 rounded-xl", className)} />
        }
      >
        <MailPlusIcon className="size-4" />
        Invite analyst
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {invite ? "Invitation ready" : "Invite an analyst"}
          </DialogTitle>
          <DialogDescription>
            {invite ? (
              <>
                Send this link to{" "}
                <span className="font-medium text-foreground">
                  {invite.email}
                </span>
                . It works once, expires in 72 hours, and creates their account
                directly in this workspace.
              </>
            ) : (
              <>
                They join as a SOC Analyst. Analysts cannot reach billing,
                settings, or team management.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {invite ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="invite-link" className="text-xs">
                Invitation link
              </Label>
              <div className="flex gap-2">
                <Input
                  id="invite-link"
                  readOnly
                  value={invite.url}
                  onFocus={(event) => event.currentTarget.select()}
                  className="h-9 rounded-lg font-mono text-xs"
                />
                <Button
                  type="button"
                  variant={copied ? "default" : "outline"}
                  size="icon"
                  aria-label="Copy invitation link"
                  onClick={copyLink}
                  className="size-9 shrink-0 rounded-lg"
                >
                  {copied ? (
                    <CheckIcon className="size-3.5" />
                  ) : (
                    <CopyIcon className="size-3.5" />
                  )}
                </Button>
              </div>
            </div>

            <p className="flex items-start gap-1.5 rounded-lg border border-warning/25 bg-warning/[0.07] px-3 py-2 text-[0.7rem] leading-relaxed text-muted-foreground">
              <ClockIcon className="mt-px size-3 shrink-0 text-warning" />
              Treat this like a password. Anyone holding the link can create
              the account for that address — send it over a channel you trust,
              and revoke it from the team page if it goes astray.
            </p>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                className="h-9 rounded-xl"
                onClick={reset}
              >
                Invite another
              </Button>
              <Button
                type="button"
                className="h-9 rounded-xl"
                onClick={() => setOpen(false)}
              >
                Done
              </Button>
            </DialogFooter>
          </motion.div>
        ) : (
          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Work email</Label>
              <Input
                id="invite-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="off"
                required
                placeholder="analyst@acme.com"
                className="h-10 rounded-xl"
              />
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <LinkIcon className="size-3" />
                {seatsLeft > 0
                  ? `${seatsLeft} of ${seats} seat${seats === 1 ? "" : "s"} available.`
                  : `All ${seats} seats are in use — upgrade to invite more.`}
              </p>
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                {error}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                className="h-9 rounded-xl"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <SubmitInvite pending={pending} />
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
