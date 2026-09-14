"use client";

import * as React from "react";
import { Loader2Icon, MailPlusIcon, SendIcon } from "lucide-react";
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
import { inviteMemberAction } from "@/lib/soc/actions";
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
      {pending ? "Sending…" : "Send invitation"}
    </Button>
  );
}

/**
 * Tenant Admin invite dialog.
 *
 * Rendered only in the Tenant Admin view, but that is presentation — the
 * action itself re-checks the role, the seat limit, and the rate limit on the
 * server, so hiding the button is never what enforces the rule.
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
  const [pending, startTransition] = React.useTransition();

  /**
   * The action is called from the submit handler rather than through
   * `useActionState`, so closing the dialog and raising the toast happen in
   * the event that caused them instead of in an effect reacting to state.
   */
  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await inviteMemberAction(undefined, formData);
      if (result.ok) {
        toast.success(result.message);
        setOpen(false);
      } else {
        setError(result.message);
        toast.error(result.message);
      }
    });
  }

  const seatsLeft = Math.max(0, seats - seatsUsed);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            className={cn("h-9 rounded-xl", className)}
          />
        }
      >
        <MailPlusIcon className="size-4" />
        Invite analyst
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite an analyst</DialogTitle>
          <DialogDescription>
            They receive an email invitation and join this workspace as a SOC
            Analyst. Analysts cannot reach billing, settings, or team
            management.
          </DialogDescription>
        </DialogHeader>

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
            <p className="text-xs text-muted-foreground">
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
      </DialogContent>
    </Dialog>
  );
}
