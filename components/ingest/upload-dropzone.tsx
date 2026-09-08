"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  FileTextIcon,
  Loader2Icon,
  ShieldCheckIcon,
  UploadCloudIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  FILE_INPUT_ACCEPT,
  FORMAT_SPECS,
  formatBytes,
} from "@/lib/ingest/constants";
import { describeFileRejection } from "@/lib/ingest/validation";
import { cn } from "@/lib/utils";

type ItemStage = "validating" | "uploading" | "queueing" | "queued" | "error";

interface UploadItem {
  key: string;
  name: string;
  size: number;
  stage: ItemStage;
  progress: number;
  error?: string;
  issues?: string[];
}

interface UploadDropzoneProps {
  maxBytes: number;
  planLabel: string;
}

/**
 * Drag-and-drop ingestion entry point.
 *
 * Uploads go straight from the browser to Supabase Storage using a signed,
 * server-issued ticket, so a 100 MB file never streams through the Next.js
 * server. `XMLHttpRequest` is used rather than `fetch` purely because it is
 * still the only way to observe upload progress.
 *
 * Client-side checks here are a courtesy — every rule is re-applied on the
 * server, and the file's actual bytes are re-validated by the worker.
 */
export function UploadDropzone({ maxBytes, planLabel }: UploadDropzoneProps) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [items, setItems] = React.useState<UploadItem[]>([]);
  const dragDepth = React.useRef(0);

  const patch = React.useCallback(
    (key: string, next: Partial<UploadItem>) => {
      setItems((current) =>
        current.map((item) => (item.key === key ? { ...item, ...next } : item))
      );
    },
    []
  );

  const uploadToSignedUrl = React.useCallback(
    (file: File, path: string, token: string, key: string) =>
      new Promise<void>((resolve, reject) => {
        const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
        if (!base) {
          reject(new Error("Storage is not configured."));
          return;
        }

        const url = `${base}/storage/v1/object/upload/sign/security-logs/${path}?token=${encodeURIComponent(token)}`;

        const body = new FormData();
        body.append("cacheControl", "3600");
        body.append("", file);

        const xhr = new XMLHttpRequest();
        xhr.open("PUT", url, true);
        xhr.setRequestHeader("x-upsert", "false");

        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          patch(key, {
            progress: Math.round((event.loaded / event.total) * 100),
          });
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Storage rejected the upload (${xhr.status}).`));
          }
        };
        xhr.onerror = () => reject(new Error("Network error during upload."));
        xhr.onabort = () => reject(new Error("Upload cancelled."));

        xhr.send(body);
      }),
    [patch]
  );

  const startUpload = React.useCallback(
    async (file: File) => {
      const key = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`;

      setItems((current) => [
        {
          key,
          name: file.name,
          size: file.size,
          stage: "validating",
          progress: 0,
        },
        ...current,
      ]);

      const rejection = describeFileRejection(file, maxBytes);
      if (rejection) {
        patch(key, { stage: "error", error: rejection });
        return;
      }

      try {
        // 1. Ask the server for a scoped ticket.
        const prepareResponse = await fetch("/api/ingest/prepare", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            size: file.size,
            mimeType: file.type,
          }),
        });

        const prepared = await prepareResponse.json();

        if (!prepareResponse.ok) {
          const issues = prepared?.issues
            ? Object.values(prepared.issues as Record<string, string[]>).flat()
            : undefined;
          patch(key, {
            stage: "error",
            error: prepared?.error ?? "Upload was rejected.",
            issues,
          });
          return;
        }

        // 2. Stream the bytes straight to storage.
        patch(key, { stage: "uploading", progress: 0 });
        await uploadToSignedUrl(file, prepared.path, prepared.token, key);

        // 3. Confirm, which verifies the object and enqueues processing.
        patch(key, { stage: "queueing", progress: 100 });
        const commitResponse = await fetch("/api/ingest/commit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ fileId: prepared.fileId }),
        });

        const committed = await commitResponse.json();
        if (!commitResponse.ok) {
          patch(key, {
            stage: "error",
            error: committed?.error ?? "Could not queue the file.",
          });
          return;
        }

        patch(key, { stage: "queued" });
        toast.success(`${file.name} queued`, {
          description: "Parsing, PII masking, and embedding run in the background.",
        });
        router.refresh();
      } catch (error) {
        patch(key, {
          stage: "error",
          error:
            error instanceof Error ? error.message : "Upload failed unexpectedly.",
        });
      }
    },
    [maxBytes, patch, router, uploadToSignedUrl]
  );

  const handleFiles = React.useCallback(
    (fileList: FileList | null) => {
      if (!fileList?.length) return;
      // Sequential rather than parallel: keeps the rate limiter happy and
      // makes the progress readable.
      void Array.from(fileList)
        .slice(0, 10)
        .reduce<Promise<void>>(
          (chain, file) => chain.then(() => startUpload(file)),
          Promise.resolve()
        );
    },
    [startUpload]
  );

  return (
    <div className="space-y-4">
      <div
        onDragEnter={(event) => {
          event.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepth.current -= 1;
          if (dragDepth.current <= 0) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
        className={cn(
          "group relative overflow-hidden rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-300 sm:p-12",
          dragging
            ? "scale-[1.01] border-primary bg-primary/[0.07]"
            : "border-border/70 bg-card/40 hover:border-primary/50 hover:bg-card/60"
        )}
      >
        {/* Scanning beam while a file hovers over the target. */}
        <AnimatePresence>
          {dragging && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
            >
              <div className="absolute inset-x-0 top-0 h-px animate-scanline bg-gradient-to-r from-transparent via-primary to-transparent" />
              <div className="absolute inset-0 grid-bg opacity-60" />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative flex flex-col items-center gap-4">
          <motion.span
            animate={
              dragging ? { y: -6, scale: 1.06 } : { y: 0, scale: 1 }
            }
            transition={{ type: "spring", stiffness: 320, damping: 20 }}
            className="flex size-14 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10"
          >
            <UploadCloudIcon className="size-6 text-primary" />
          </motion.span>

          <div className="space-y-1.5">
            <p className="font-heading text-base font-semibold">
              {dragging ? "Release to ingest" : "Drop security logs here"}
            </p>
            <p className="text-sm text-muted-foreground">
              or{" "}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                browse your files
              </button>
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {FORMAT_SPECS.map((spec) => (
              <span
                key={spec.format}
                className="rounded-md border border-border/60 bg-muted/50 px-2 py-0.5 font-mono text-[0.6rem] tracking-wide text-muted-foreground uppercase"
              >
                {spec.label}
              </span>
            ))}
          </div>

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheckIcon className="size-3.5 text-success" />
            {planLabel} plan · up to {formatBytes(maxBytes)} · PII masked before
            indexing
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={FILE_INPUT_ACCEPT}
          className="sr-only"
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      <AnimatePresence initial={false}>
        {items.map((item) => (
          <motion.div
            key={item.key}
            layout
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
          >
            <UploadRow
              item={item}
              onDismiss={() =>
                setItems((current) =>
                  current.filter((entry) => entry.key !== item.key)
                )
              }
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

const STAGE_COPY: Record<ItemStage, string> = {
  validating: "Validating",
  uploading: "Uploading",
  queueing: "Verifying",
  queued: "Queued for analysis",
  error: "Rejected",
};

function UploadRow({
  item,
  onDismiss,
}: {
  item: UploadItem;
  onDismiss: () => void;
}) {
  const isError = item.stage === "error";
  const isDone = item.stage === "queued";

  return (
    <div
      className={cn(
        "rounded-xl border px-3.5 py-3",
        isError
          ? "border-destructive/30 bg-destructive/[0.06]"
          : "border-border/60 bg-card/60"
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg border",
            isError
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : isDone
                ? "border-success/30 bg-success/10 text-success"
                : "border-border/60 bg-muted/50 text-muted-foreground"
          )}
        >
          {isError ? (
            <AlertTriangleIcon className="size-4" />
          ) : isDone ? (
            <CheckCircle2Icon className="size-4" />
          ) : (
            <FileTextIcon className="size-4" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.name}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {!isError && !isDone && (
              <Loader2Icon className="size-3 animate-spin" />
            )}
            {STAGE_COPY[item.stage]}
            <span aria-hidden="true">·</span>
            {formatBytes(item.size)}
          </p>
        </div>

        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Dismiss ${item.name}`}
          onClick={onDismiss}
          className="shrink-0"
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>

      {item.stage === "uploading" && (
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-brand-1 to-brand-2"
            initial={{ width: 0 }}
            animate={{ width: `${item.progress}%` }}
            transition={{ ease: "easeOut", duration: 0.25 }}
          />
        </div>
      )}

      {isError && item.error && (
        <div className="mt-2.5 space-y-1 rounded-lg border border-destructive/20 bg-destructive/[0.06] px-2.5 py-2">
          <p className="text-xs leading-relaxed text-destructive">
            {item.error}
          </p>
          {item.issues && item.issues.length > 0 && (
            <ul className="space-y-0.5">
              {item.issues.map((issue) => (
                <li
                  key={issue}
                  className="flex items-start gap-1.5 text-[0.7rem] text-destructive/85"
                >
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-current" />
                  {issue}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
