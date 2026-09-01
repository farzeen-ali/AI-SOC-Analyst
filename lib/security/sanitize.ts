/**
 * Input sanitisation helpers.
 *
 * React escapes anything rendered as text, so these exist for the values that
 * escape that guarantee: strings persisted to Postgres and later surfaced in
 * emails, audit logs, or exports. They strip rather than encode, because none
 * of the fields in Phase 1 are meant to carry markup at all.
 *
 * Every regex here is built fresh per call site (no shared `/g` literals) so
 * `lastIndex` from a previous call can never make a later check pass.
 */

const CONTROL_CHARS = "\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F";
/** Zero-width, word-joiner, and bidi override characters. */
const INVISIBLE_CHARS =
  "\\u00AD\\u200B-\\u200F\\u2028\\u2029\\u202A-\\u202E\\u2060-\\u2064\\uFEFF";

const strippable = () => new RegExp(`[${CONTROL_CHARS}${INVISIBLE_CHARS}]`, "g");
const tagLike = () => /<[^>]*>?/g;

/**
 * Collapses whitespace and removes control, invisible, and tag-like sequences.
 * Use for every free-text field (names, workspace names) before persisting.
 */
export function sanitizeText(input: unknown, maxLength = 512): string {
  if (typeof input !== "string") return "";
  return input
    .replace(strippable(), "")
    .replace(tagLike(), "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/** Normalises an email for storage and for use as a rate-limit bucket key. */
export function sanitizeEmail(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .replace(strippable(), "")
    .replace(/\s/g, "")
    .toLowerCase()
    .slice(0, 254);
}

/** Keeps only digits — used for the 6-digit OTP fields. */
export function sanitizeDigits(input: unknown, maxLength = 6): string {
  if (typeof input !== "string") return "";
  return input.replace(/\D/g, "").slice(0, maxLength);
}

/** URL-safe slug derived from a workspace name. */
export function slugify(input: string): string {
  const base = sanitizeText(input, 64)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "workspace";
}

/**
 * Guards post-auth redirects against open-redirect abuse by allowing only
 * same-site absolute paths.
 */
export function safeRedirectPath(
  input: unknown,
  fallback = "/dashboard"
): string {
  if (typeof input !== "string") return fallback;
  if (!input.startsWith("/") || input.startsWith("//")) return fallback;
  if (input.includes("\\")) return fallback;
  if (new RegExp(`[${CONTROL_CHARS}${INVISIBLE_CHARS}]`).test(input)) {
    return fallback;
  }
  return input;
}
