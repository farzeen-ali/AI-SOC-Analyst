import Papa from "papaparse";

import {
  MAX_LINE_LENGTH,
  MAX_PARSED_EVENTS,
} from "@/lib/ingest/constants";
import type { LogFormat } from "@/lib/types/database";

/**
 * Format detection and normalisation for uploaded security logs.
 *
 * Everything here treats the input as hostile. A signed upload URL means the
 * bytes at a storage path were never seen by our server before this point, so
 * the worker re-detects the format, bounds the work, and neutralises the
 * injection vectors that log data classically carries (spreadsheet formulas,
 * prototype pollution via JSON keys, terminal escapes).
 */

export interface NormalizedEvent {
  /** 1-based line number in the source file. */
  line: number;
  timestamp?: string;
  level?: string;
  source?: string;
  message: string;
  fields?: Record<string, string>;
}

export interface ParseIssue {
  line: number;
  reason: string;
  /** Short excerpt, already truncated and stripped, safe to display. */
  excerpt?: string;
}

export interface ParseResult {
  format: LogFormat;
  events: NormalizedEvent[];
  issues: ParseIssue[];
  /** True when the file exceeded MAX_PARSED_EVENTS and was cut short. */
  truncated: boolean;
}

export class UnsupportedContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedContentError";
  }
}

/* ------------------------------------------------------------------ *
 *  Sanitisation primitives
 * ------------------------------------------------------------------ */

const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
/** ANSI/VT escape sequences — logs are full of them and terminals honour them. */
const ANSI_ESCAPES = /\x1B\[[0-9;?]*[ -/]*[@-~]/g;
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function cleanText(value: string, maxLength = MAX_LINE_LENGTH): string {
  return value
    .replace(ANSI_ESCAPES, "")
    .replace(CONTROL_CHARS, "")
    .slice(0, maxLength);
}

/**
 * Neutralises spreadsheet formula injection.
 * A CSV cell starting with = + - @ executes when the export is opened in
 * Excel or Sheets, so the leading character is quoted off.
 */
function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/**
 * Recursively flattens parsed JSON into `key=value` pairs.
 * Drops prototype-polluting keys outright rather than copying them onward.
 */
function flattenObject(
  input: unknown,
  prefix = "",
  depth = 0,
  out: Record<string, string> = {}
): Record<string, string> {
  if (depth > 6 || Object.keys(out).length > 120) return out;

  if (input === null || input === undefined) return out;

  if (Array.isArray(input)) {
    input.slice(0, 25).forEach((item, index) => {
      flattenObject(item, prefix ? `${prefix}.${index}` : String(index), depth + 1, out);
    });
    return out;
  }

  if (typeof input === "object") {
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (DANGEROUS_KEYS.has(key)) continue;
      const path = prefix ? `${prefix}.${key}` : key;
      flattenObject(value, path, depth + 1, out);
    }
    return out;
  }

  out[prefix || "value"] = cleanText(String(input), 512);
  return out;
}

function pick(
  fields: Record<string, string>,
  candidates: string[]
): string | undefined {
  for (const candidate of candidates) {
    const hit = Object.keys(fields).find(
      (key) => key.toLowerCase() === candidate || key.toLowerCase().endsWith(`.${candidate}`)
    );
    if (hit && fields[hit]) return fields[hit];
  }
  return undefined;
}

const TIMESTAMP_KEYS = ["timestamp", "time", "ts", "@timestamp", "date", "eventtime"];
const LEVEL_KEYS = ["level", "severity", "loglevel", "priority", "status"];
const SOURCE_KEYS = ["source", "host", "hostname", "logger", "service", "appname"];
const MESSAGE_KEYS = ["message", "msg", "event", "description", "text", "body"];

function eventFromFields(
  line: number,
  fields: Record<string, string>
): NormalizedEvent {
  const message =
    pick(fields, MESSAGE_KEYS) ??
    Object.entries(fields)
      .slice(0, 12)
      .map(([key, value]) => `${key}=${value}`)
      .join(" ");

  return {
    line,
    timestamp: pick(fields, TIMESTAMP_KEYS),
    level: pick(fields, LEVEL_KEYS),
    source: pick(fields, SOURCE_KEYS),
    message: cleanText(message),
    fields,
  };
}

/* ------------------------------------------------------------------ *
 *  Format detection
 * ------------------------------------------------------------------ */

const SYSLOG_RFC5424 =
  /^<(\d{1,3})>(\d)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s*(.*)$/;
const SYSLOG_RFC3164 =
  /^<(\d{1,3})>([A-Z][a-z]{2}\s+\d{1,2}\s\d{2}:\d{2}:\d{2})\s(\S+)\s(.*)$/;
const SYSLOG_PLAIN =
  /^([A-Z][a-z]{2}\s+\d{1,2}\s\d{2}:\d{2}:\d{2})\s(\S+)\s([^:]+):\s*(.*)$/;

/**
 * Determines the real format from the bytes, independent of the extension.
 * Returns null when the content matches nothing we accept.
 */
export function detectFormat(sample: string): LogFormat | null {
  const trimmed = sample.trimStart();
  if (!trimmed) return null;

  // Binary sniff: NUL bytes or a high ratio of unprintables means this is not
  // a text log, whatever the extension claimed.
  const controlCount = (sample.slice(0, 4096).match(CONTROL_CHARS) ?? []).length;
  if (controlCount > sample.slice(0, 4096).length * 0.02) return null;

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return "json";
  }

  const lines = trimmed
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .slice(0, 40);

  if (lines.length === 0) return null;

  const syslogHits = lines.filter(
    (line) =>
      SYSLOG_RFC5424.test(line) ||
      SYSLOG_RFC3164.test(line) ||
      SYSLOG_PLAIN.test(line)
  ).length;
  if (syslogHits >= Math.max(2, lines.length * 0.5)) return "syslog";

  const jsonLineHits = lines.filter((line) =>
    line.trimStart().startsWith("{")
  ).length;
  if (jsonLineHits >= Math.max(2, lines.length * 0.6)) return "json";

  // CSV: a stable, non-trivial column count across the sample.
  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const counts = lines.map((line) => line.split(delimiter).length);
  const first = counts[0];
  if (first >= 2 && counts.filter((count) => count === first).length >= lines.length * 0.8) {
    return "csv";
  }

  return "plaintext";
}

/* ------------------------------------------------------------------ *
 *  Parsers
 * ------------------------------------------------------------------ */

function parseJson(content: string): ParseResult {
  const events: NormalizedEvent[] = [];
  const issues: ParseIssue[] = [];
  let truncated = false;

  const trimmed = content.trim();

  // A single JSON array of records.
  if (trimmed.startsWith("[")) {
    let records: unknown;
    try {
      records = JSON.parse(trimmed);
    } catch (error) {
      throw new UnsupportedContentError(
        `File declares JSON but does not parse: ${
          error instanceof Error ? error.message : "invalid JSON"
        }`
      );
    }

    if (!Array.isArray(records)) {
      throw new UnsupportedContentError(
        "Top-level JSON must be an array of log records."
      );
    }

    for (const [index, record] of records.entries()) {
      if (events.length >= MAX_PARSED_EVENTS) {
        truncated = true;
        break;
      }
      if (record === null || typeof record !== "object") {
        issues.push({ line: index + 1, reason: "Record is not an object." });
        continue;
      }
      events.push(eventFromFields(index + 1, flattenObject(record)));
    }

    return { format: "json", events, issues, truncated };
  }

  // NDJSON / JSON Lines.
  const lines = content.split(/\r?\n/);
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim();
    if (!line) continue;

    if (events.length >= MAX_PARSED_EVENTS) {
      truncated = true;
      break;
    }

    try {
      const record: unknown = JSON.parse(line);
      if (record === null || typeof record !== "object") {
        issues.push({
          line: index + 1,
          reason: "Line is valid JSON but not an object.",
          excerpt: cleanText(line, 120),
        });
        continue;
      }
      events.push(eventFromFields(index + 1, flattenObject(record)));
    } catch {
      issues.push({
        line: index + 1,
        reason: "Malformed JSON on this line.",
        excerpt: cleanText(line, 120),
      });
    }
  }

  if (events.length === 0 && issues.length > 0) {
    throw new UnsupportedContentError(
      "No valid JSON records were found in this file."
    );
  }

  return { format: "json", events, issues, truncated };
}

function parseCsv(content: string): ParseResult {
  const events: NormalizedEvent[] = [];
  const issues: ParseIssue[] = [];

  const parsed = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
    transformHeader: (header) => cleanText(header, 120).trim() || "column",
  });

  for (const error of parsed.errors.slice(0, 25)) {
    issues.push({
      line: (error.row ?? 0) + 2,
      reason: error.message,
    });
  }

  if (!parsed.data.length) {
    throw new UnsupportedContentError(
      "CSV contained a header but no data rows."
    );
  }

  let truncated = false;
  for (const [index, row] of parsed.data.entries()) {
    if (events.length >= MAX_PARSED_EVENTS) {
      truncated = true;
      break;
    }

    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      if (DANGEROUS_KEYS.has(key)) continue;
      if (value === null || value === undefined) continue;
      fields[key] = neutralizeFormula(cleanText(String(value), 512));
    }

    if (Object.keys(fields).length === 0) continue;
    events.push(eventFromFields(index + 2, fields));
  }

  return { format: "csv", events, issues, truncated };
}

function parseSyslog(content: string): ParseResult {
  const events: NormalizedEvent[] = [];
  const issues: ParseIssue[] = [];
  let truncated = false;

  const SEVERITIES = [
    "emerg",
    "alert",
    "crit",
    "err",
    "warning",
    "notice",
    "info",
    "debug",
  ];

  const lines = content.split(/\r?\n/);
  for (const [index, raw] of lines.entries()) {
    const line = cleanText(raw).trim();
    if (!line) continue;

    if (events.length >= MAX_PARSED_EVENTS) {
      truncated = true;
      break;
    }

    const lineNumber = index + 1;

    const rfc5424 = SYSLOG_RFC5424.exec(line);
    if (rfc5424) {
      const priority = Number(rfc5424[1]);
      events.push({
        line: lineNumber,
        timestamp: rfc5424[3] === "-" ? undefined : rfc5424[3],
        level: SEVERITIES[priority % 8],
        source: rfc5424[4] === "-" ? undefined : rfc5424[4],
        message: rfc5424[8] || rfc5424[5],
        fields: {
          facility: String(Math.floor(priority / 8)),
          appname: rfc5424[5],
          procid: rfc5424[6],
          msgid: rfc5424[7],
        },
      });
      continue;
    }

    const rfc3164 = SYSLOG_RFC3164.exec(line);
    if (rfc3164) {
      const priority = Number(rfc3164[1]);
      events.push({
        line: lineNumber,
        timestamp: rfc3164[2],
        level: SEVERITIES[priority % 8],
        source: rfc3164[3],
        message: rfc3164[4],
      });
      continue;
    }

    const plain = SYSLOG_PLAIN.exec(line);
    if (plain) {
      events.push({
        line: lineNumber,
        timestamp: plain[1],
        source: plain[2],
        message: `${plain[3]}: ${plain[4]}`,
      });
      continue;
    }

    // Continuation lines and stack traces are common — keep them as events
    // rather than rejecting, but note them if they dominate the file.
    events.push({ line: lineNumber, message: line });
    if (issues.length < 25) {
      issues.push({
        line: lineNumber,
        reason: "Line did not match a known syslog framing; kept as raw text.",
        excerpt: line.slice(0, 120),
      });
    }
  }

  if (events.length === 0) {
    throw new UnsupportedContentError("Syslog file contained no readable lines.");
  }

  return { format: "syslog", events, issues, truncated };
}

function parsePlaintext(content: string): ParseResult {
  const events: NormalizedEvent[] = [];
  let truncated = false;

  const LEVEL_IN_LINE =
    /\b(TRACE|DEBUG|INFO|NOTICE|WARN(?:ING)?|ERROR|CRIT(?:ICAL)?|ALERT|FATAL|EMERG)\b/i;
  const ISO_TIMESTAMP =
    /\b(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\b/;

  const lines = content.split(/\r?\n/);
  for (const [index, raw] of lines.entries()) {
    const line = cleanText(raw).trim();
    if (!line) continue;

    if (events.length >= MAX_PARSED_EVENTS) {
      truncated = true;
      break;
    }

    events.push({
      line: index + 1,
      timestamp: ISO_TIMESTAMP.exec(line)?.[1],
      level: LEVEL_IN_LINE.exec(line)?.[1]?.toUpperCase(),
      message: line,
    });
  }

  if (events.length === 0) {
    throw new UnsupportedContentError("File contained no readable log lines.");
  }

  return { format: "plaintext", events, issues: [], truncated };
}

/**
 * Detects the real format and normalises the file into events.
 * `declared` is the extension-derived format, used only to report a mismatch.
 */
export function parseLogFile(
  content: string,
  declared: LogFormat
): ParseResult {
  const detected = detectFormat(content.slice(0, 64 * 1024));

  if (!detected) {
    throw new UnsupportedContentError(
      "File does not look like a text-based log. Binary content is rejected."
    );
  }

  // Syslog and plaintext are interchangeable enough that a mismatch between
  // them is not worth failing over; anything else is a real inconsistency.
  const interchangeable =
    (detected === "plaintext" && declared === "syslog") ||
    (detected === "syslog" && declared === "plaintext");

  if (detected !== declared && !interchangeable) {
    throw new UnsupportedContentError(
      `File extension declares ${declared.toUpperCase()} but the contents look like ${detected.toUpperCase()}.`
    );
  }

  switch (detected) {
    case "json":
      return parseJson(content);
    case "csv":
      return parseCsv(content);
    case "syslog":
      return parseSyslog(content);
    default:
      return parsePlaintext(content);
  }
}

/** Renders a normalised event back to a single searchable line. */
export function eventToLine(event: NormalizedEvent): string {
  const parts: string[] = [];
  if (event.timestamp) parts.push(event.timestamp);
  if (event.level) parts.push(`[${event.level.toUpperCase()}]`);
  if (event.source) parts.push(event.source);
  parts.push(event.message);
  return parts.join(" ");
}
