import "server-only";

import { getRedis } from "@/lib/redis";
import { createAdminClient } from "@/lib/supabase/admin";
import { dailyScanLimit } from "@/lib/billing/plans";
import type { WorkspacePlan } from "@/lib/types/database";

/**
 * Daily scan metering.
 *
 * Two independent concerns, deliberately kept apart:
 *
 *  - **The gate** decides whether this scan may proceed. It has to be atomic,
 *    because several analysts in the same workspace can upload concurrently
 *    and a read-then-write would let all of them pass a limit of one.
 *  - **The ledger** (`usage_daily`) is the durable record behind the Super
 *    Admin graphs and the billing page. It survives Redis eviction.
 *
 * When Upstash is present Redis is the gate and the ledger is updated
 * alongside it. When it is absent the `consume_scan_quota` RPC does both in a
 * single statement, so the guarantee holds either way — it is just slower.
 */

export interface QuotaDecision {
  allowed: boolean;
  /** Scans consumed today *after* this call. */
  used: number;
  /** Null when the plan is unlimited. */
  limit: number | null;
  /** Seconds until the allowance resets. */
  resetSeconds: number;
  /** True when the gate ran in Redis rather than the database fallback. */
  atomicBackend: "redis" | "postgres";
}

/**
 * INCR, then DECR when the increment crossed the limit.
 *
 * Redis runs an EVAL body atomically — nothing interleaves between these
 * commands — so the increment doubles as the claim. Reserving first and
 * giving back on overflow is what makes the check and the claim a single
 * indivisible step; a `GET` followed by a conditional `SET` would leave a
 * window where two concurrent uploads both read 4 and both write 5.
 *
 * The TTL is only set on the first increment of the day, so a burst of
 * requests cannot keep pushing the reset time forward.
 *
 * Returns { allowed, count, ttl }.
 */
const CONSUME_SCRIPT = `
local limit = tonumber(ARGV[1])
local ttl   = tonumber(ARGV[2])

local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ttl)
end

if count > limit then
  count = redis.call('DECR', KEYS[1])
  return { 0, count, redis.call('TTL', KEYS[1]) }
end

return { 1, count, redis.call('TTL', KEYS[1]) }
`;

/** Hands a reservation back when the work it was claimed for never happened. */
const RELEASE_SCRIPT = `
local count = tonumber(redis.call('GET', KEYS[1]) or '0')
if count <= 0 then
  return 0
end
return redis.call('DECR', KEYS[1])
`;

/** Seconds remaining until 00:00 UTC, which is when the daily window rolls. */
function secondsUntilUtcMidnight(now = new Date()): number {
  const next = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1
  );
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

function utcDayStamp(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function scanKey(workspaceId: string, now = new Date()): string {
  return `guardai:quota:scan:${workspaceId}:${utcDayStamp(now)}`;
}

/**
 * Claims one daily scan for a workspace.
 *
 * Call this *before* doing the work. If the work then fails to start, call
 * `releaseScan()` so the tenant is not billed a scan for nothing.
 */
export async function consumeScan(
  workspaceId: string,
  plan: WorkspacePlan,
  isSuperAdmin: boolean
): Promise<QuotaDecision> {
  const limit = dailyScanLimit(plan, isSuperAdmin);
  const resetSeconds = secondsUntilUtcMidnight();

  // Unlimited tiers still get recorded — the graphs and the billing page show
  // usage regardless of whether anything is being enforced.
  if (limit === null) {
    const used = await recordScanOnly(workspaceId);
    return {
      allowed: true,
      used,
      limit: null,
      resetSeconds,
      atomicBackend: "redis",
    };
  }

  const redis = getRedis();

  if (redis) {
    try {
      const result = (await redis.eval(
        CONSUME_SCRIPT,
        [scanKey(workspaceId)],
        [String(limit), String(resetSeconds)]
      )) as [number, number, number];

      const [allowedFlag, count, ttl] = result;
      const allowed = allowedFlag === 1;

      // Mirror an accepted scan into the durable ledger. A failure here must
      // not fail the upload: the gate has already decided, and the ledger is
      // reporting, not enforcement.
      if (allowed) void recordScanOnly(workspaceId);

      return {
        allowed,
        used: count,
        limit,
        resetSeconds: ttl > 0 ? ttl : resetSeconds,
        atomicBackend: "redis",
      };
    } catch (error) {
      // A Redis outage must not become an outage of the product. Fall through
      // to the database gate, which is equally correct.
      console.error(
        "[quota] redis gate unavailable, falling back to postgres",
        error instanceof Error ? error.message : error
      );
    }
  }

  return consumeViaPostgres(workspaceId, limit, resetSeconds);
}

async function consumeViaPostgres(
  workspaceId: string,
  limit: number | null,
  resetSeconds: number
): Promise<QuotaDecision> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("consume_scan_quota", {
    p_workspace_id: workspaceId,
    p_limit: limit,
  });

  if (error) {
    console.error("[quota] postgres gate failed", error.message);
    // Fail closed. An un-meterable scan is a free scan, and a metering
    // outage should not silently become unlimited usage.
    return {
      allowed: false,
      used: limit ?? 0,
      limit,
      resetSeconds,
      atomicBackend: "postgres",
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: row?.allowed ?? false,
    used: row?.used ?? 0,
    limit: row?.quota ?? limit,
    resetSeconds,
    atomicBackend: "postgres",
  };
}

/** Ledger-only increment, used for unlimited plans and Redis mirroring. */
async function recordScanOnly(workspaceId: string): Promise<number> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.rpc("record_usage", {
      p_workspace_id: workspaceId,
      p_scans: 1,
    });
    return typeof data === "number" ? data : 0;
  } catch {
    return 0;
  }
}

/**
 * Returns a claimed scan.
 *
 * Only touches Redis: the ledger is a record of scans *attempted*, and an
 * upload that was authorised then abandoned still cost the system the work of
 * authorising it. The quota is the thing the tenant should get back.
 */
export async function releaseScan(workspaceId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.eval(RELEASE_SCRIPT, [scanKey(workspaceId)], []);
  } catch (error) {
    console.error(
      "[quota] could not release scan",
      error instanceof Error ? error.message : error
    );
  }
}

/** Read-only view of today's usage, for the billing page. Consumes nothing. */
export async function peekScanUsage(
  workspaceId: string,
  plan: WorkspacePlan,
  isSuperAdmin: boolean
): Promise<{ used: number; limit: number | null; resetSeconds: number }> {
  const limit = dailyScanLimit(plan, isSuperAdmin);
  const resetSeconds = secondsUntilUtcMidnight();

  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.get<number | string>(scanKey(workspaceId));
      const used = Number(raw ?? 0);
      if (Number.isFinite(used)) return { used, limit, resetSeconds };
    } catch {
      // Fall through to the ledger.
    }
  }

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("usage_daily")
      .select("scans")
      .eq("workspace_id", workspaceId)
      .eq("day", utcDayStamp())
      .maybeSingle();
    return { used: data?.scans ?? 0, limit, resetSeconds };
  } catch {
    return { used: 0, limit, resetSeconds };
  }
}

/** Records token consumption from the AI pipeline. Never gates. */
export async function recordTokenUsage(
  workspaceId: string,
  tokens: number,
  aiCalls = 1
): Promise<void> {
  if (tokens <= 0 && aiCalls <= 0) return;
  try {
    const admin = createAdminClient();
    await admin.rpc("record_usage", {
      p_workspace_id: workspaceId,
      p_tokens: Math.max(0, Math.round(tokens)),
      p_ai_calls: Math.max(0, aiCalls),
    });
  } catch (error) {
    console.error(
      "[quota] token usage not recorded",
      error instanceof Error ? error.message : error
    );
  }
}
