"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { CheckIcon, GaugeIcon, SparklesIcon } from "lucide-react";

import { CheckoutButton } from "@/components/billing/checkout-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PRO_PLAN, formatPlanPrice } from "@/lib/billing/plans";

export interface QuotaState {
  used: number;
  limit: number | null;
  resetSeconds: number;
}

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quota?: QuotaState | null;
  /** Analysts see the wall but cannot pay — they need their admin. */
  canPurchase: boolean;
}

function formatReset(seconds: number): string {
  if (seconds <= 0) return "shortly";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours >= 1) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

/**
 * The paywall that appears when a Free workspace exhausts its daily scans.
 *
 * Deliberately shows what happens if they *don't* upgrade — the reset time —
 * alongside the upgrade path. A wall with only one exit reads as a hostage
 * situation; a wall that tells you the free option still works reads as a
 * limit, which is what it is.
 */
export function UpgradeModal({
  open,
  onOpenChange,
  quota,
  canPurchase,
}: UpgradeModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden sm:max-w-lg">
        {/* Ambient wash so the dialog reads as a moment, not an error. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 left-1/2 size-64 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl"
        />

        <DialogHeader className="relative">
          <motion.span
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="mb-2 flex size-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10"
          >
            <GaugeIcon className="size-6 text-primary" />
          </motion.span>

          <DialogTitle className="text-xl">
            You have used today&apos;s scans
          </DialogTitle>
          <DialogDescription>
            {quota?.limit != null ? (
              <>
                The Free plan includes{" "}
                <span className="font-medium text-foreground">
                  {quota.limit} scans a day
                </span>
                . Your allowance resets in{" "}
                <span className="font-medium text-foreground">
                  {formatReset(quota.resetSeconds)}
                </span>
                , or move to Pro for unlimited analysis.
              </>
            ) : (
              <>
                This workspace has reached its daily scan allowance. Upgrade to
                Pro for unlimited analysis.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="relative space-y-4">
          <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.09] via-transparent to-brand-2/[0.07] p-4">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                <SparklesIcon className="size-4 text-primary" />
                GuardAI Pro
              </span>
              <span className="font-mono text-2xl font-semibold">
                {formatPlanPrice(PRO_PLAN)}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  /month
                </span>
              </span>
            </div>

            <ul className="space-y-1.5">
              {PRO_PLAN.features.map((feature, index) => (
                <motion.li
                  key={feature}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.06 * index, duration: 0.3 }}
                  className="flex items-start gap-2 text-sm"
                >
                  <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-success" />
                  <span className="text-muted-foreground">{feature}</span>
                </motion.li>
              ))}
            </ul>
          </div>

          {canPurchase ? (
            <CheckoutButton size="lg" className="w-full" />
          ) : (
            <p className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2.5 text-center text-xs text-muted-foreground">
              Ask a Tenant Admin in this workspace to upgrade. Analysts cannot
              change the subscription.
            </p>
          )}

          <Button
            type="button"
            variant="ghost"
            className="h-9 w-full rounded-xl text-muted-foreground"
            onClick={() => onOpenChange(false)}
          >
            Not now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
