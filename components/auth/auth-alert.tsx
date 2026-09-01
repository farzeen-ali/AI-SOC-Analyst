"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2Icon,
  InfoIcon,
  ShieldAlertIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type AuthAlertTone = "error" | "success" | "info" | "warning";

const TONES = {
  error: {
    icon: ShieldAlertIcon,
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  success: {
    icon: CheckCircle2Icon,
    className: "border-success/30 bg-success/10 text-success",
  },
  info: {
    icon: InfoIcon,
    className: "border-info/30 bg-info/10 text-info",
  },
  warning: {
    icon: TriangleAlertIcon,
    className: "border-warning/30 bg-warning/10 text-warning",
  },
} as const;

interface AuthAlertProps {
  tone: AuthAlertTone;
  message?: string | null;
  className?: string;
}

/** Inline banner for Server Action results — lock-outs, rate limits, receipts. */
export function AuthAlert({ tone, message, className }: AuthAlertProps) {
  const { icon: Icon, className: toneClassName } = TONES[tone];

  return (
    <AnimatePresence initial={false} mode="wait">
      {message ? (
        <motion.div
          key={message}
          role={tone === "error" ? "alert" : "status"}
          initial={{ opacity: 0, y: -6, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -6, height: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div
            className={cn(
              "flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm",
              toneClassName,
              className
            )}
          >
            <Icon className="mt-px size-4 shrink-0" />
            <p className="leading-relaxed">{message}</p>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
