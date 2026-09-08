"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangleIcon,
  BrainCircuitIcon,
  CheckCircle2Icon,
  DatabaseIcon,
  FileTextIcon,
  Loader2Icon,
  RotateCwIcon,
  ScanTextIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  deleteLogFileAction,
  retryLogFileAction,
} from "@/lib/ingest/actions";
import { formatBytes } from "@/lib/ingest/constants";
import type { IngestStatus, LogFile } from "@/lib/types/database";
import { cn } from "@/lib/utils";

/** Statuses that mean the background worker still has the file. */
const ACTIVE: IngestStatus[] = ["queued", "parsing", "embedding", "analyzing"];

const PIPELINE: Array<{
  status: IngestStatus;
  label: string;
  icon: typeof FileTextIcon;
}> = [
  { status: "queued", label: "Queued", icon: FileTextIcon },
  { status: "parsing", label: "Parsing & masking", icon: ScanTextIcon },
  { status: "embedding", label: "Embedding", icon: DatabaseIcon },
  { status: "analyzing", label: "AI analysis", icon: BrainCircuitIcon },
];

interface FileListProps {
  files: LogFile[];
  canDelete: boolean;
}

/**
 * Ingestion queue with a live pipeline view.
 *
 * Polls by re-running the server component while any file is in flight, which
 * keeps the RLS-scoped query as the single source of truth rather than opening
 * a second, separately-authorised data path. Polling stops as soon as
 * everything settles.
 */
export function FileList({ files, canDelete }: FileListProps) {
  const router = useRouter();
  const hasActive = files.some((file) => ACTIVE.includes(file.status));

  React.useEffect(() => {
    if (!hasActive) return;
    const interval = window.setInterval(() => {
      if (!document.hidden) router.refresh();
    }, 3000);
    return () => window.clearInterval(interval);
  }, [hasActive, router]);

  if (files.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 px-6 py-14 text-center">
        <p className="text-sm text-muted-foreground">
          No logs ingested yet. Drop a file above to start the pipeline.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2.5">
      <AnimatePresence initial={false}>
        {files.map((file, index) => (
          <motion.li
            key={file.id}
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.2) }}
          >
            <FileRow file={file} canDelete={canDelete} />
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

function FileRow({ file, canDelete }: { file: LogFile; canDelete: boolean }) {
  const [deleting, startDelete] = React.useTransition();
  const [retrying, startRetry] = React.useTransition();
  const router = useRouter();

  const isActive = ACTIVE.includes(file.status);
  const isFailed = file.status === "failed";
  const isDone = file.status === "completed";
  const activeStep = PIPELINE.findIndex((step) => step.status === file.status);

  function handleDelete() {
    startDelete(async () => {
      const payload = new FormData();
      payload.set("fileId", file.id);
      const result = await deleteLogFileAction(undefined, payload);
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  function handleRetry() {
    startRetry(async () => {
      const payload = new FormData();
      payload.set("fileId", file.id);
      const result = await retryLogFileAction(undefined, payload);
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <div
      className={cn(
        "rounded-xl border bg-card/60 px-4 py-3 backdrop-blur-xl transition-colors",
        isFailed ? "border-destructive/30" : "border-border/60",
        isActive && "border-primary/30"
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn(
            "relative flex size-9 shrink-0 items-center justify-center rounded-lg border",
            isFailed
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : isDone
                ? "border-success/30 bg-success/10 text-success"
                : "border-primary/25 bg-primary/10 text-primary"
          )}
        >
          {isActive && (
            <span
              aria-hidden="true"
              className="absolute inset-0 animate-pulse-ring rounded-lg border border-primary/40"
            />
          )}
          {isFailed ? (
            <AlertTriangleIcon className="size-4" />
          ) : isDone ? (
            <CheckCircle2Icon className="size-4" />
          ) : (
            <Loader2Icon className="size-4 animate-spin" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{file.filename}</p>
          <p className="truncate font-mono text-[0.7rem] text-muted-foreground">
            {file.format.toUpperCase()} · {formatBytes(file.size_bytes)}
            {file.event_count > 0 &&
              ` · ${file.event_count.toLocaleString()} events`}
            {file.chunk_count > 0 && ` · ${file.chunk_count} chunks`}
            {file.masked_count > 0 && ` · ${file.masked_count} masked`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "rounded-md border px-2 py-0.5 font-mono text-[0.6rem] tracking-wider uppercase",
              isFailed
                ? "sev-critical"
                : isDone
                  ? "sev-resolved"
                  : "border-primary/30 bg-primary/10 text-primary"
            )}
          >
            {file.status}
          </span>

          {isFailed && (
            <Button
              variant="outline"
              size="sm"
              disabled={retrying}
              onClick={handleRetry}
              className="h-7 rounded-lg text-xs"
            >
              {retrying ? (
                <Loader2Icon className="size-3 animate-spin" />
              ) : (
                <RotateCwIcon className="size-3" />
              )}
              Retry
            </Button>
          )}

          {canDelete && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete ${file.filename}`}
              disabled={deleting}
              onClick={handleDelete}
              className="text-muted-foreground hover:text-destructive"
            >
              {deleting ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <Trash2Icon className="size-3.5" />
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Pipeline stepper — only while the worker still owns the file. */}
      {isActive && (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {PIPELINE.map((step, index) => {
            const done = index < activeStep;
            const current = index === activeStep;
            const StepIcon = step.icon;

            return (
              <React.Fragment key={step.status}>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[0.65rem] transition-colors",
                    current
                      ? "bg-primary/12 font-medium text-primary"
                      : done
                        ? "text-success"
                        : "text-muted-foreground/60"
                  )}
                >
                  <StepIcon className="size-3" />
                  {step.label}
                </span>
                {index < PIPELINE.length - 1 && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "h-px w-4",
                      done ? "bg-success/50" : "bg-border"
                    )}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* Parse notes on success, failure reason on error. */}
      {file.error_message && (
        <p
          className={cn(
            "mt-2.5 rounded-lg border px-2.5 py-1.5 text-xs leading-relaxed",
            isFailed
              ? "border-destructive/25 bg-destructive/[0.06] text-destructive"
              : "border-warning/25 bg-warning/[0.06] text-warning"
          )}
        >
          {file.error_message}
        </p>
      )}
    </div>
  );
}
