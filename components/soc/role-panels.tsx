import Link from "next/link";
import {
  ArrowRightIcon,
  CrownIcon,
  ShieldIcon,
  SparklesIcon,
} from "lucide-react";

import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import type { UserDTO } from "@/lib/auth/dal";

/**
 * Role-scoped dashboard chrome.
 *
 * These are rendered on the server from the RLS-verified auth context, so a
 * Member's HTML never contains the billing or team affordances at all — they
 * are absent rather than hidden with CSS. The routes behind them re-check the
 * role regardless.
 */

/** Super Admin only: platform-wide banner plus the admin portal link. */
export function PlatformManagementBanner({ user }: { user: UserDTO }) {
  if (!user.isSuperAdmin) return null;

  return (
    <Reveal>
      <section className="relative overflow-hidden rounded-2xl border border-brand-3/30 bg-gradient-to-r from-brand-3/12 via-brand-2/10 to-transparent p-4">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-20 -right-10 size-52 rounded-full bg-brand-3/20 blur-3xl"
        />

        <div className="relative flex flex-wrap items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-brand-3/35 bg-brand-3/15">
            <CrownIcon className="size-4 text-brand-3" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 font-heading text-sm font-semibold">
              Platform Management
              <span className="rounded-md border border-brand-3/35 bg-brand-3/10 px-1.5 py-0.5 font-mono text-[0.55rem] tracking-wider text-brand-3 uppercase">
                Super Admin
              </span>
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              You are viewing one tenant. Plan limits do not apply to your
              account, and the platform console spans every workspace.
            </p>
          </div>

          <Button
            variant="outline"
            className="h-9 shrink-0 rounded-xl border-brand-3/35"
            nativeButton={false}
            render={<Link href="/super-admin" />}
          >
            <ShieldIcon className="size-4" />
            Admin portal
            <ArrowRightIcon className="size-3.5" />
          </Button>
        </div>
      </section>
    </Reveal>
  );
}

/**
 * Tenant Admin only: plan status and the upgrade path.
 * Members never receive this markup.
 */
export function UpgradePanel({
  user,
  index = 0,
}: {
  user: UserDTO;
  index?: number;
}) {
  if (!user.isTenantAdmin) return null;

  const isPro = user.workspacePlan === "pro";

  return (
    <Reveal index={index}>
      <section
        className={
          isPro
            ? "rounded-2xl border border-success/30 bg-success/[0.07] p-4"
            : "relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/12 to-brand-2/10 p-4"
        }
      >
        {!isPro && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-16 -right-12 size-44 rounded-full bg-primary/20 blur-3xl"
          />
        )}

        <div className="relative flex flex-wrap items-center gap-3">
          <span
            className={
              isPro
                ? "flex size-10 shrink-0 items-center justify-center rounded-xl border border-success/35 bg-success/15"
                : "flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/35 bg-primary/15"
            }
          >
            <SparklesIcon
              className={isPro ? "size-4 text-success" : "size-4 text-primary"}
            />
          </span>

          <div className="min-w-0 flex-1">
            <p className="font-heading text-sm font-semibold">
              {isPro ? "Pro plan active" : "You are on the Free plan"}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {isPro
                ? "Unlimited ingestion, full retention, and unlimited analyst seats."
                : "10 MB uploads and 3 seats. Pro raises ingestion to 100 MB and removes the seat cap."}
            </p>
          </div>

          <Button
            variant={isPro ? "outline" : "default"}
            className={
              isPro
                ? "h-9 shrink-0 rounded-xl"
                : "h-9 shrink-0 rounded-xl bg-gradient-to-r from-brand-1 to-brand-2 text-primary-foreground"
            }
            nativeButton={false}
            render={<Link href="/dashboard/billing" />}
          >
            {isPro ? "Manage plan" : "Upgrade to Pro"}
            <ArrowRightIcon className="size-3.5" />
          </Button>
        </div>
      </section>
    </Reveal>
  );
}
