/**
 * PII masking for ingested log lines.
 *
 * Runs in the background worker *before* anything is persisted or sent to an
 * embedding/LLM API, so raw personal data never reaches the vector store or a
 * third party. Masking is deliberately lossy but shape-preserving: an analyst
 * can still correlate "same user" or "same subnet" across events because equal
 * inputs mask to equal outputs, while the original value is unrecoverable.
 *
 * Order matters — the most specific patterns run first so a credit card is not
 * partially consumed by the phone-number rule.
 */

export interface MaskResult {
  text: string;
  /** Total number of substitutions made. */
  count: number;
}

interface Rule {
  name: string;
  pattern: RegExp;
  replace: (match: string, ...groups: string[]) => string;
}

/** Short stable tag so repeated values stay correlatable after masking. */
function fingerprint(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).slice(0, 6);
}

const RULES: Rule[] = [
  {
    // Bearer tokens, JWTs, and long opaque secrets.
    name: "token",
    pattern:
      /\b(?:eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})\b/g,
    replace: (match) => `[JWT:${fingerprint(match)}]`,
  },
  {
    name: "secret-assignment",
    pattern:
      /\b(password|passwd|pwd|secret|token|api[_-]?key|authorization|auth|session[_-]?id|cookie)\b(\s*[=:]\s*)("?)([^\s",;&]{3,})\3/gi,
    replace: (_match, key: string, sep: string, quote: string) =>
      `${key}${sep}${quote}[REDACTED]${quote}`,
  },
  {
    name: "credit-card",
    // 13–19 digits with optional separators, Luhn-checked below.
    pattern: /\b(?:\d[ -]?){12,18}\d\b/g,
    replace: (match) =>
      luhnValid(match.replace(/[^\d]/g, ""))
        ? `[CARD:${fingerprint(match.replace(/[^\d]/g, ""))}]`
        : match,
  },
  {
    name: "ssn",
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    replace: (match) => `[SSN:${fingerprint(match)}]`,
  },
  {
    name: "email",
    pattern: /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g,
    // Keeps the domain: "which tenant/provider" is usually the signal, the
    // mailbox rarely is.
    replace: (match, domain: string) =>
      `[EMAIL:${fingerprint(match)}]@${domain}`,
  },
  {
    name: "ipv4",
    pattern: /\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g,
    // Keeps the /16 so subnet-level correlation survives.
    replace: (match, a: string, b: string, c: string, d: string) => {
      const octets = [a, b, c, d].map(Number);
      if (octets.some((octet) => octet > 255)) return match;
      return `${a}.${b}.x.x`;
    },
  },
  {
    // Must run before the IPv6 rule: `00:1B:44:11:3A:B7` also satisfies the
    // looser IPv6 grouping, and would otherwise be masked as an address.
    name: "mac",
    pattern: /\b(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b/gi,
    replace: (match) => `[MAC:${fingerprint(match.toLowerCase())}]`,
  },
  {
    name: "ipv6",
    pattern: /\b(?:[0-9a-f]{1,4}:){4,7}[0-9a-f]{1,4}\b/gi,
    replace: (match) => {
      const head = match.split(":").slice(0, 3).join(":");
      return `${head}::x`;
    },
  },
  {
    name: "phone",
    pattern: /(?<![\w.])\+?\d{1,3}[ -]?\(?\d{3}\)?[ -]?\d{3}[ -]?\d{4}(?![\w.])/g,
    replace: (match) => `[PHONE:${fingerprint(match.replace(/\D/g, ""))}]`,
  },
  {
    name: "aws-key",
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
    replace: (match) => `[AWSKEY:${fingerprint(match)}]`,
  },
  {
    name: "private-key",
    pattern: /-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[A-Z ]*PRIVATE KEY-----/g,
    replace: () => "[PRIVATE_KEY_REDACTED]",
  },
];

function luhnValid(digits: string): boolean {
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let value = digits.charCodeAt(index) - 48;
    if (value < 0 || value > 9) return false;
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Masks every known PII pattern in `input`, reporting how many it replaced. */
export function maskPii(input: string): MaskResult {
  let text = input;
  let count = 0;

  for (const rule of RULES) {
    // Fresh regex per pass: the shared literals carry /g state otherwise.
    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
    text = text.replace(pattern, (...args) => {
      const replacement = rule.replace(
        args[0] as string,
        ...(args.slice(1, -2) as string[])
      );
      if (replacement !== args[0]) count += 1;
      return replacement;
    });
  }

  return { text, count };
}
