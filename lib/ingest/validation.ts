import { z } from "zod";

import {
  ABSOLUTE_MAX_BYTES,
  MIN_UPLOAD_BYTES,
  formatFromFilename,
  isAcceptedMimeType,
} from "@/lib/ingest/constants";

/**
 * Upload request validation, shared by the browser and the API route.
 *
 * The filename rules are deliberately strict: the value ends up in a storage
 * object key and in the UI, so path separators, traversal sequences, and
 * control characters are rejected outright rather than sanitised away.
 */

const FILENAME_REGEX = /^[\w][\w .()\[\]{}@#+-]{0,180}$/;

export const uploadFilenameSchema = z
  .string()
  .trim()
  .min(3, "Filename is too short.")
  .max(180, "Filename must be 180 characters or fewer.")
  .refine((value) => !value.includes("/") && !value.includes("\\"), {
    message: "Filename must not contain path separators.",
  })
  .refine((value) => !value.includes(".."), {
    message: "Filename must not contain '..'.",
  })
  .refine((value) => FILENAME_REGEX.test(value), {
    message: "Filename contains unsupported characters.",
  })
  .refine((value) => formatFromFilename(value) !== null, {
    message:
      "Unsupported file type. Upload .json, .ndjson, .csv, .syslog, or .log files.",
  });

export const prepareUploadSchema = z.object({
  filename: uploadFilenameSchema,
  size: z
    .number()
    .int("File size must be a whole number of bytes.")
    .min(MIN_UPLOAD_BYTES, "File is empty.")
    .max(ABSOLUTE_MAX_BYTES, "File exceeds the maximum supported size."),
  mimeType: z
    .string()
    .max(160)
    .default("")
    .refine(isAcceptedMimeType, {
      message: "Unsupported content type for a security log.",
    }),
});

export const commitUploadSchema = z.object({
  fileId: z.uuid("Malformed upload reference."),
});

export const findingStatusSchema = z.object({
  findingId: z.uuid("Malformed finding reference."),
  status: z.enum(["open", "acknowledged", "resolved", "dismissed"]),
});

export const deleteFileSchema = z.object({
  fileId: z.uuid("Malformed file reference."),
});

export type PrepareUploadInput = z.infer<typeof prepareUploadSchema>;
export type CommitUploadInput = z.infer<typeof commitUploadSchema>;

/** Client-side pre-flight so obvious rejects never reach the network. */
export function describeFileRejection(
  file: File,
  maxBytes: number
): string | null {
  const parsed = uploadFilenameSchema.safeParse(file.name);
  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? "Unsupported file.";
  }
  if (file.size < MIN_UPLOAD_BYTES) return "File is empty.";
  if (file.size > maxBytes) {
    return `File is larger than your plan allows (${(maxBytes / (1024 * 1024)).toFixed(0)} MB).`;
  }
  if (!isAcceptedMimeType(file.type)) {
    return "Unsupported content type for a security log.";
  }
  return null;
}
