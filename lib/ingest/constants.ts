import { PLANS } from "@/lib/billing/plans";
import type { LogFormat, WorkspacePlan } from "@/lib/types/database";

/**
 * Hard size ceilings per subscription tier, in bytes.
 *
 * Derived from the plan catalogue rather than restated, so the upload gate
 * and the pricing page can never disagree about what a tier includes.
 */
export const PLAN_UPLOAD_LIMITS: Record<WorkspacePlan, number> = {
  free: PLANS.free.maxUploadBytes,
  pro: PLANS.pro.maxUploadBytes,
};

/** Super Admin accounts are exempt from tier limits, but not from this. */
export const ABSOLUTE_MAX_BYTES = 100 * 1024 * 1024;

export const MIN_UPLOAD_BYTES = 8;

/**
 * Accepted formats.
 *
 * Extension and MIME are both checked before a ticket is issued, and the
 * worker re-sniffs the actual bytes afterwards — a signed upload URL means
 * the client could put anything at that path.
 */
export interface FormatSpec {
  format: LogFormat;
  extensions: readonly string[];
  mimeTypes: readonly string[];
  label: string;
}

export const FORMAT_SPECS: readonly FormatSpec[] = [
  {
    format: "json",
    extensions: [".json", ".ndjson", ".jsonl"],
    mimeTypes: [
      "application/json",
      "application/x-ndjson",
      "application/jsonl",
      "text/json",
    ],
    label: "JSON / NDJSON",
  },
  {
    format: "csv",
    extensions: [".csv", ".tsv"],
    mimeTypes: ["text/csv", "application/csv", "text/tab-separated-values"],
    label: "CSV / TSV",
  },
  {
    format: "syslog",
    extensions: [".syslog", ".rfc5424"],
    mimeTypes: ["text/plain", "application/octet-stream"],
    label: "Syslog",
  },
  {
    format: "plaintext",
    extensions: [".log", ".txt", ".out"],
    mimeTypes: ["text/plain", "application/octet-stream"],
    label: "Plain log",
  },
] as const;

export const ACCEPTED_EXTENSIONS = FORMAT_SPECS.flatMap(
  (spec) => spec.extensions
);

export const ACCEPTED_MIME_TYPES = [
  ...new Set(FORMAT_SPECS.flatMap((spec) => spec.mimeTypes)),
];

/** `accept` attribute for the file input. */
export const FILE_INPUT_ACCEPT = [
  ...ACCEPTED_EXTENSIONS,
  ...ACCEPTED_MIME_TYPES,
].join(",");

/** Resolves the declared format from a filename, or null when unsupported. */
export function formatFromFilename(filename: string): LogFormat | null {
  const lower = filename.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot === -1) return null;
  const extension = lower.slice(dot);

  for (const spec of FORMAT_SPECS) {
    if (spec.extensions.includes(extension)) return spec.format;
  }
  return null;
}

export function isAcceptedMimeType(mime: string): boolean {
  // Browsers frequently send an empty type for uncommon extensions.
  if (!mime) return true;
  return ACCEPTED_MIME_TYPES.includes(mime.split(";")[0].trim().toLowerCase());
}

export function uploadLimitFor(
  plan: WorkspacePlan,
  isSuperAdmin: boolean
): number {
  return isSuperAdmin ? ABSOLUTE_MAX_BYTES : PLAN_UPLOAD_LIMITS[plan];
}

/* ------------------------------------------------------------------ *
 *  Parsing and chunking guardrails
 *
 *  These bound the worker's memory and cost regardless of what a tenant
 *  uploads — a 100 MB file of one-character lines must not produce
 *  millions of chunks or a multi-thousand-dollar embedding bill.
 * ------------------------------------------------------------------ */

export const MAX_PARSED_EVENTS = 50_000;
export const MAX_LINE_LENGTH = 8_000;
export const MAX_CHUNKS_PER_FILE = 1_500;

/** Characters per chunk, with overlap to preserve cross-boundary context. */
export const CHUNK_SIZE_CHARS = 1_600;
export const CHUNK_OVERLAP_CHARS = 240;

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;
/** OpenAI accepts large batches; this keeps a single request well inside limits. */
export const EMBEDDING_BATCH_SIZE = 96;

export const ANALYSIS_MODEL = "gpt-4o-mini";
/** Chunks retrieved per RAG query before they are handed to the model. */
export const RAG_MATCH_COUNT = 12;
export const RAG_MIN_SIMILARITY = 0.15;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
