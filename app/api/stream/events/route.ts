import { NextResponse, type NextRequest } from "next/server";

import { getAuthContext } from "@/lib/auth/dal";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getClientIp } from "@/lib/security/request";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SocEvent } from "@/lib/soc/queries";

export const runtime = "nodejs";
export const maxDuration = 90;

/** How often the tail looks for new rows. */
const POLL_MS = 2500;
/**
 * The stream closes itself well before any platform timeout and lets the
 * browser's native `EventSource` reconnect. Holding a serverless function open
 * indefinitely is the expensive failure mode here.
 */
const STREAM_LIFETIME_MS = 55_000;

/**
 * Server-Sent Events tail of workspace activity.
 *
 * `EventSource` cannot set request headers, but it does send same-origin
 * cookies — which is where the Supabase session lives — so the connection is
 * authenticated exactly like any other request.
 *
 * Authorisation is resolved **once**, before the stream opens, through the
 * RLS-scoped `getAuthContext()`. The polling loop then uses the service-role
 * client with an explicit `workspace_id` filter, because `cookies()` is
 * request-scoped and must not be re-read after the response has begun
 * streaming. The tenant boundary is the workspace id captured from that
 * verified context, never anything supplied by the client.
 */
export async function GET(request: NextRequest) {
  const context = await getAuthContext();
  if (!context?.workspace) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const ip = await getClientIp();
  const limit = await checkRateLimit(
    "eventStream",
    `ws:${context.workspace.id}:${ip}`
  );
  if (!limit.success) {
    return NextResponse.json(
      { error: "Too many stream connections." },
      { status: 429 }
    );
  }

  const workspaceId = context.workspace.id;
  const admin = createAdminClient();

  // Only emit rows newer than this, so a reconnect does not replay history.
  let cursor = new Date().toISOString();

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
            )
          );
        } catch {
          closed = true;
        }
      };

      const shutdown = () => {
        if (closed) return;
        closed = true;
        clearInterval(poll);
        clearTimeout(lifetime);
        try {
          controller.close();
        } catch {
          // Already closed by the client disconnecting.
        }
      };

      // Tell the client how long to wait before reconnecting.
      send("ready", { workspaceId, pollMs: POLL_MS });

      const tick = async () => {
        if (closed) return;

        try {
          const [files, findings] = await Promise.all([
            admin
              .from("log_files")
              .select("id, filename, status, format, event_count, updated_at")
              .eq("workspace_id", workspaceId)
              .gt("updated_at", cursor)
              .order("updated_at", { ascending: true })
              .limit(20),
            admin
              .from("threat_findings")
              .select(
                "id, title, threat_type, severity_score, status, created_at"
              )
              .eq("workspace_id", workspaceId)
              .gt("created_at", cursor)
              .order("created_at", { ascending: true })
              .limit(20),
          ]);

          const events: SocEvent[] = [];

          for (const file of files.data ?? []) {
            events.push({
              id: `file:${file.id}:${file.updated_at}`,
              kind: "ingest",
              at: file.updated_at,
              label: file.filename,
              detail:
                file.event_count > 0
                  ? `${file.format.toUpperCase()} · ${file.event_count.toLocaleString()} events`
                  : file.format.toUpperCase(),
              severity: null,
              state: file.status,
            });
          }

          for (const finding of findings.data ?? []) {
            events.push({
              id: `finding:${finding.id}`,
              kind: "finding",
              at: finding.created_at,
              label: finding.title,
              detail: finding.threat_type,
              severity: finding.severity_score,
              state: finding.status,
            });
          }

          if (events.length > 0) {
            events.sort(
              (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
            );
            cursor = events[events.length - 1].at;
            send("events", events);
          } else {
            // Keeps proxies from closing an idle connection.
            send("heartbeat", { at: new Date().toISOString() });
          }
        } catch (error) {
          console.error("[stream] poll failed", error);
          send("error", { message: "Stream interrupted." });
          shutdown();
        }
      };

      const poll = setInterval(tick, POLL_MS);
      const lifetime = setTimeout(shutdown, STREAM_LIFETIME_MS);

      request.signal.addEventListener("abort", shutdown);

      await tick();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      // Stops nginx-style proxies from buffering the stream.
      "X-Accel-Buffering": "no",
    },
  });
}
