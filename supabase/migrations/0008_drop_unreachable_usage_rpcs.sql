-- ============================================================================
--  GuardAI — 0008: remove two unreachable usage helpers
--
--  Idempotent: safe to run repeatedly.
--
--  `platform_usage_series()` and `workspace_usage_totals()` shipped in 0007
--  gated on `public.is_super_admin()`, which resolves `auth.uid()`. Every
--  caller of the platform console uses the service-role client, where
--  `auth.uid()` is NULL — so the guard was always false and the function
--  could never succeed through its only call path. The Super Admin usage
--  chart silently rendered empty as a result.
--
--  Rather than widen a SECURITY DEFINER function to accept the service role,
--  the aggregation now happens in `lib/admin/queries.ts`, where
--  `requireSuperAdmin()` is the authorisation check. Summing a fortnight of
--  rows never needed elevated SQL, and dropping these removes two
--  definer-rights functions from the attack surface.
--
--  `record_usage()` and `consume_scan_quota()` are deliberately kept: those
--  are called on the hot path and genuinely need definer rights to write
--  `usage_daily` on behalf of a tenant.
-- ============================================================================

drop function if exists public.platform_usage_series(integer);
drop function if exists public.workspace_usage_totals(uuid);
