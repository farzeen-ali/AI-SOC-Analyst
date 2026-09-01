"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2Icon, ShieldCheckIcon, ShieldOffIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { ModerationResult } from "@/lib/admin/actions";

type ModerationAction = (
  prevState: ModerationResult | undefined,
  formData: FormData
) => Promise<ModerationResult>;

function ToggleButton({ suspended }: { suspended: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      size="sm"
      variant={suspended ? "outline" : "destructive"}
      disabled={pending}
      className="h-7 shrink-0 rounded-lg text-xs"
    >
      {pending ? (
        <Loader2Icon className="size-3 animate-spin" />
      ) : suspended ? (
        <ShieldCheckIcon className="size-3" />
      ) : (
        <ShieldOffIcon className="size-3" />
      )}
      {suspended ? "Reinstate" : "Suspend"}
    </Button>
  );
}

interface SuspensionToggleProps {
  action: ModerationAction;
  id: string;
  suspended: boolean;
  /** Disables the control — e.g. a Super Admin viewing their own row. */
  disabled?: boolean;
  disabledReason?: string;
}

/**
 * One-click suspend / reinstate for a tenant or user.
 *
 * Suspension is reversible by design: it revokes access immediately without
 * destroying data. Irreversible deletion is not exposed from the console.
 */
export function SuspensionToggle({
  action,
  id,
  suspended,
  disabled,
  disabledReason,
}: SuspensionToggleProps) {
  const [state, formAction] = useActionState<ModerationResult | undefined, FormData>(
    action,
    undefined
  );

  React.useEffect(() => {
    if (!state) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  if (disabled) {
    return (
      <span className="shrink-0 rounded-md border border-border/60 bg-muted/50 px-2 py-1 font-mono text-[0.55rem] tracking-wide text-muted-foreground uppercase">
        {disabledReason ?? "Locked"}
      </span>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="suspended" value={suspended ? "false" : "true"} />
      <ToggleButton suspended={suspended} />
    </form>
  );
}
