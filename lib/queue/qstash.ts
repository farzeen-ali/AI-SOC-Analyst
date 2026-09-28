import "server-only";

import { Client, Receiver } from "@upstash/qstash";

import { env, hasQStash, isProduction } from "@/lib/env";
import { planFor } from "@/lib/billing/plans";
import type { WorkspacePlan } from "@/lib/types/database";

/**
 * Background job transport.
 *
 * QStash publishes an HTTP callback to our own worker route, which is what
 * moves parsing, PII masking, and embedding off the request that the user is
 * waiting on. Without it (local development), the caller falls back to Next's
 * `after()` — still off the response path, just not durable or retried.
 */

export const INGEST_JOB_PATH = "/api/jobs/process-log";

export interface IngestJobPayload {
  fileId: string;
  workspaceId: string;
}

/**
 * AI execution priority.
 *
 * Implemented with QStash flow control rather than a flag the worker reads:
 * each tier publishes under its own flow-control key with its own
 * parallelism, so Free jobs queue behind *each other* while Pro jobs keep
 * flowing. Under load that is what "priority execution" actually has to mean
 * — a label the worker ignores would change nothing about who waits.
 *
 * The small Free delay costs a few seconds on an idle system and gives Pro a
 * genuine head start on a busy one.
 */
const PRIORITY_LANES = {
  priority: { key: "guardai-ingest-pro", parallelism: 12, retries: 5, delay: 0 },
  standard: { key: "guardai-ingest-free", parallelism: 2, retries: 3, delay: 3 },
} as const;

function laneFor(plan: WorkspacePlan) {
  return PRIORITY_LANES[planFor(plan).aiPriority];
}

let client: Client | null = null;
let receiver: Receiver | null = null;

function getClient(): Client {
  client ??= new Client({ token: env.qstashToken });
  return client;
}

function getReceiver(): Receiver {
  receiver ??= new Receiver({
    currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY ?? "",
    nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY ?? "",
  });
  return receiver;
}

/**
 * QStash delivers jobs by calling us back over the public internet, so a
 * loopback or private-network site URL can never receive one — it rejects the
 * publish outright with "endpoint resolves to a loopback address".
 *
 * Having a token is therefore not the same as being able to publish. This is
 * the check that decides between the real queue and the local fallback.
 */
function isPubliclyReachable(rawUrl: string): boolean {
  let hostname: string;
  try {
    ({ hostname } = new URL(rawUrl));
  } catch {
    return false;
  }

  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (host === "::1" || host === "0.0.0.0") return false;
  if (/^127\./.test(host)) return false;
  if (/^10\./.test(host)) return false;
  if (/^192\.168\./.test(host)) return false;
  if (/^169\.254\./.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;

  return true;
}

/** True only when a job can actually be published *and* delivered. */
export const queueAvailable = hasQStash && isPubliclyReachable(env.siteUrl);

/**
 * Publishes an ingestion job.
 * Returns the QStash message id, or null when running on the local fallback.
 */
export async function publishIngestJob(
  payload: IngestJobPayload,
  plan: WorkspacePlan = "free"
): Promise<string | null> {
  if (!queueAvailable) {
    if (isProduction) {
      throw new Error(
        hasQStash
          ? `NEXT_PUBLIC_SITE_URL ("${env.siteUrl}") is not reachable from the ` +
            `public internet, so QStash cannot deliver ingestion jobs. Set it to ` +
            `the deployment's real origin.`
          : "QSTASH_TOKEN and signing keys are required in production: log ingestion " +
            "must run on a durable, retried queue rather than in-process."
      );
    }
    return null;
  }

  const lane = laneFor(plan);

  const { messageId } = await getClient().publishJSON({
    url: `${env.siteUrl}${INGEST_JOB_PATH}`,
    body: payload,
    retries: lane.retries,
    // Parsing + embedding a large file legitimately takes minutes.
    timeout: "5m",
    flowControl: { key: lane.key, parallelism: lane.parallelism },
    ...(lane.delay > 0 ? { delay: lane.delay } : {}),
  });

  return messageId;
}

/**
 * Verifies that a worker request genuinely came from QStash.
 *
 * The worker route is publicly reachable, so this signature check is the only
 * thing standing between the internet and our ingestion pipeline. Returns the
 * raw body on success so the caller parses exactly the bytes that were signed.
 */
export async function verifyJobRequest(
  request: Request
): Promise<{ ok: true; body: string } | { ok: false; reason: string }> {
  const body = await request.text();

  if (!queueAvailable) {
    // Local fallback: the route is only reachable from this process, and the
    // shared secret below still prevents a stray external call.
    if (isProduction) return { ok: false, reason: "Queue not configured." };

    const devSecret = request.headers.get("x-guardai-dev-job");
    if (!devSecret || devSecret !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return { ok: false, reason: "Missing local job authorisation." };
    }
    return { ok: true, body };
  }

  const signature = request.headers.get("upstash-signature");
  if (!signature) return { ok: false, reason: "Missing signature header." };

  try {
    const valid = await getReceiver().verify({
      signature,
      body,
      url: `${env.siteUrl}${INGEST_JOB_PATH}`,
    });
    if (!valid) return { ok: false, reason: "Signature verification failed." };
    return { ok: true, body };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error ? error.message : "Signature verification error.",
    };
  }
}
