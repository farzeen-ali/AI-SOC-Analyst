"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ActivityIcon,
  FileTextIcon,
  PauseIcon,
  PlayIcon,
  ShieldAlertIcon,
} from "lucide-react";

import { severityFromScore } from "@/components/threat/severity-badge";
import { useDocumentVisible } from "@/lib/hooks/use-client-state";
import { Button } from "@/components/ui/button";
import type { SocEvent } from "@/lib/soc/queries";
import { cn } from "@/lib/utils";

const MAX_ROWS = 60;
/** Consecutive failed reconnects before the tail stops trying. */
const MAX_RECONNECTS = 4;

const LEVEL_TEXT: Record<string, string> = {
  critical: "text-critical",
  high: "text-high",
  medium: "text-medium",
  low: "text-low",
  info: "text-muted-foreground",
};

type Connection = "connecting" | "live" | "paused" | "error";

/**
 * Live tail of workspace activity.
 *
 * Backed by an SSE endpoint rather than polling a JSON route, so new rows
 * arrive as the server sees them. `EventSource` reconnects on its own when the
 * server closes the stream at its lifetime limit, which is why the endpoint
 * can stay short-lived without the client noticing a gap.
 *
 * The stream is closed while the tab is hidden or the analyst pauses it — a
 * backgrounded dashboard should not hold a server connection open.
 */
export function LiveLogStream({
  initialEvents,
  className,
}: {
  initialEvents: SocEvent[];
  className?: string;
}) {
  const [events, setEvents] = React.useState<SocEvent[]>(initialEvents);
  const [paused, setPaused] = React.useState(false);
  /** What the stream itself reports; `connection` below layers intent on top. */
  const [streamState, setStreamState] = React.useState<"connecting" | "live">(
    "connecting"
  );

  // Counts reconnects that never reached "ready". `EventSource` retries
  // forever by default, which would turn an expired session or a 429 into a
  // client hammering the endpoint indefinitely.
  const failures = React.useRef(0);
  const [givenUp, setGivenUp] = React.useState(false);

  const visible = useDocumentVisible();

  // Derived, not stored. A stream that is paused, backgrounded, or given up
  // is a fact about intent — storing it would need an effect to keep in sync,
  // and the badge could then disagree with reality.
  const connection: Connection = givenUp
    ? "error"
    : paused || !visible
      ? "paused"
      : streamState;

  React.useEffect(() => {
    // A backgrounded tab should not hold a server connection open.
    if (paused || givenUp || !visible) return;

    let source: EventSource | null = null;
    let cancelled = false;

    const open = () => {
      if (cancelled) return;

      source = new EventSource("/api/stream/events");

      source.addEventListener("ready", () => {
        failures.current = 0;
        setStreamState("live");
      });

      source.addEventListener("events", (message) => {
        try {
          const incoming = JSON.parse(
            (message as MessageEvent<string>).data
          ) as SocEvent[];

          setEvents((current) => {
            // Ids are content-derived, so a reconnect that replays a row
            // updates in place instead of duplicating it.
            const seen = new Map(current.map((event) => [event.id, event]));
            for (const event of incoming) seen.set(event.id, event);

            return [...seen.values()]
              .sort(
                (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
              )
              .slice(0, MAX_ROWS);
          });
        } catch {
          // A malformed frame should not take the stream down.
        }
      });

      source.addEventListener("error", () => {
        // Per the EventSource spec the two readyStates mean different things:
        //
        //   CLOSED     - a fatal failure (non-200 status, wrong MIME type).
        //                The browser will NOT retry, so showing "connecting"
        //                here would be a lie. Give up immediately.
        //   CONNECTING - a transient drop the browser is already retrying.
        //                Tolerate a few, then stop so an expired session or a
        //                429 cannot turn into an endless reconnect loop.
        if (source?.readyState === EventSource.CLOSED) {
          close();
          setGivenUp(true);
          return;
        }

        failures.current += 1;
        if (failures.current >= MAX_RECONNECTS) {
          close();
          setGivenUp(true);
          return;
        }

        setStreamState("connecting");
      });
    };

    const close = () => {
      source?.close();
      source = null;
    };

    open();

    return () => {
      cancelled = true;
      close();
    };
  }, [paused, givenUp, visible]);

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <ActivityIcon className="size-3.5 text-primary" />
          <span className="font-mono text-[0.6rem] tracking-[0.16em] text-muted-foreground uppercase">
            Live stream
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5">
            <span className="relative flex size-1.5">
              {connection === "live" && (
                <span className="absolute inline-flex size-full animate-pulse-ring rounded-full bg-success" />
              )}
              <span
                className={cn(
                  "relative inline-flex size-1.5 rounded-full",
                  connection === "live" && "bg-success",
                  connection === "connecting" && "bg-warning",
                  connection === "paused" && "bg-muted-foreground",
                  connection === "error" && "bg-destructive"
                )}
              />
            </span>
            <span className="font-mono text-[0.6rem] text-muted-foreground">
              {connection}
            </span>
          </span>

          {givenUp && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 rounded-md text-[0.6rem]"
              onClick={() => {
                failures.current = 0;
                setStreamState("connecting");
                setGivenUp(false);
              }}
            >
              Reconnect
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={paused ? "Resume live stream" : "Pause live stream"}
            onClick={() => setPaused((current) => !current)}
          >
            {paused ? (
              <PlayIcon className="size-3" />
            ) : (
              <PauseIcon className="size-3" />
            )}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {events.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            Nothing yet. Ingest a log file and events will appear here live.
          </p>
        ) : (
          <ul className="divide-y divide-border/40">
            <AnimatePresence initial={false}>
              {events.map((event) => (
                <motion.li
                  key={event.id}
                  layout
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="flex items-start gap-2.5 px-4 py-2 transition-colors hover:bg-muted/30"
                >
                  <span className="mt-0.5 shrink-0">
                    {event.kind === "finding" ? (
                      <ShieldAlertIcon
                        className={cn(
                          "size-3.5",
                          LEVEL_TEXT[severityFromScore(event.severity ?? 0)]
                        )}
                      />
                    ) : (
                      <FileTextIcon className="size-3.5 text-muted-foreground" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">
                      {event.label}
                    </p>
                    <p className="truncate font-mono text-[0.65rem] text-muted-foreground">
                      {event.detail}
                      {event.severity !== null && ` · sev ${event.severity}/10`}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className="rounded border border-border/60 bg-muted/50 px-1 py-px font-mono text-[0.55rem] tracking-wide text-muted-foreground uppercase">
                      {event.state}
                    </span>
                    <time
                      dateTime={event.at}
                      className="font-mono text-[0.55rem] text-muted-foreground/70"
                      suppressHydrationWarning
                    >
                      {new Date(event.at).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </time>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  );
}
