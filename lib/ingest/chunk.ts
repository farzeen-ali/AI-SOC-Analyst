import {
  CHUNK_OVERLAP_CHARS,
  CHUNK_SIZE_CHARS,
  MAX_CHUNKS_PER_FILE,
} from "@/lib/ingest/constants";
import { eventToLine, type NormalizedEvent } from "@/lib/ingest/parse";

export interface LogChunk {
  index: number;
  content: string;
  tokenEstimate: number;
  metadata: {
    startLine: number;
    endLine: number;
    eventCount: number;
    levels: string[];
    sources: string[];
  };
}

/** ~4 characters per token for log-shaped text — close enough for budgeting. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Groups normalised events into overlapping chunks.
 *
 * Chunks never split an event in half, so a retrieved chunk is always a whole
 * number of log lines. The overlap carries the tail of the previous chunk
 * forward, which is what keeps a multi-line attack sequence (a spray followed
 * by the one successful auth) retrievable as a single unit even when it
 * straddles a boundary.
 */
export function chunkEvents(events: NormalizedEvent[]): LogChunk[] {
  if (events.length === 0) return [];

  const chunks: LogChunk[] = [];

  let buffer: NormalizedEvent[] = [];
  let bufferChars = 0;

  const flush = () => {
    if (buffer.length === 0) return;

    const lines = buffer.map(eventToLine);
    const content = lines.join("\n");

    const levels = [
      ...new Set(
        buffer
          .map((event) => event.level?.toUpperCase())
          .filter((level): level is string => Boolean(level))
      ),
    ].slice(0, 8);

    const sources = [
      ...new Set(
        buffer
          .map((event) => event.source)
          .filter((source): source is string => Boolean(source))
      ),
    ].slice(0, 8);

    chunks.push({
      index: chunks.length,
      content,
      tokenEstimate: estimateTokens(content),
      metadata: {
        startLine: buffer[0].line,
        endLine: buffer[buffer.length - 1].line,
        eventCount: buffer.length,
        levels,
        sources,
      },
    });

    // Carry the tail forward as overlap for the next chunk.
    const overlap: NormalizedEvent[] = [];
    let overlapChars = 0;
    for (let index = buffer.length - 1; index >= 0; index -= 1) {
      const size = eventToLine(buffer[index]).length + 1;
      if (overlapChars + size > CHUNK_OVERLAP_CHARS) break;
      overlap.unshift(buffer[index]);
      overlapChars += size;
    }

    // A single event larger than the overlap budget would repeat forever.
    buffer = overlap.length < buffer.length ? overlap : [];
    bufferChars = buffer.reduce(
      (total, event) => total + eventToLine(event).length + 1,
      0
    );
  };

  for (const event of events) {
    if (chunks.length >= MAX_CHUNKS_PER_FILE) break;

    const size = eventToLine(event).length + 1;

    if (bufferChars + size > CHUNK_SIZE_CHARS && buffer.length > 0) {
      flush();
    }

    buffer.push(event);
    bufferChars += size;
  }

  if (buffer.length > 0 && chunks.length < MAX_CHUNKS_PER_FILE) {
    // Final flush must not re-seed the buffer.
    const lines = buffer.map(eventToLine);
    const content = lines.join("\n");
    chunks.push({
      index: chunks.length,
      content,
      tokenEstimate: estimateTokens(content),
      metadata: {
        startLine: buffer[0].line,
        endLine: buffer[buffer.length - 1].line,
        eventCount: buffer.length,
        levels: [
          ...new Set(
            buffer
              .map((event) => event.level?.toUpperCase())
              .filter((level): level is string => Boolean(level))
          ),
        ].slice(0, 8),
        sources: [
          ...new Set(
            buffer
              .map((event) => event.source)
              .filter((source): source is string => Boolean(source))
          ),
        ].slice(0, 8),
      },
    });
  }

  return chunks;
}
