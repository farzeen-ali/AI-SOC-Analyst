-- ============================================================================
--  GuardAI — Phase 4: billing, tokenized invitations, usage metering
--
--  Idempotent: safe to run repeatedly against an existing project.
--
--  Three concerns land together because they share the same trust boundary —
--  all three are written by privileged server code (Stripe webhook, invitation
--  acceptance, ingestion worker) and only ever *read* by tenants.
-- ============================================================================

-- ----------------------------------------------------------------------------
--  1. Stripe columns on the workspace
--
--  The workspace is the billing entity, not the user: a Tenant Admin pays for
--  the tenant, and seats are a property of the tenant. Storing the Stripe ids
--  here keeps the mapping one-to-one and lets the webhook resolve a workspace
--  from a customer id without a lookup table.
-- ----------------------------------------------------------------------------

alter table public.workspaces
  add column if not exists stripe_customer_id     text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_price_id        text,
  add column if not exists current_period_end     timestamptz,
  add column if not exists cancel_at_period_end   boolean not null default false;

-- Partial unique indexes: many workspaces legitimately have NULL here.
create unique index if not exists workspaces_stripe_customer_key
  on public.workspaces (stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists workspaces_stripe_subscription_key
  on public.workspaces (stripe_subscription_id)
  where stripe_subscription_id is not null;

-- ----------------------------------------------------------------------------
--  2. Seat allocation per plan
--
--  Free  = 1 Tenant Admin + 1 Member  =  2 seats
--  Pro   = 1 Tenant Admin + 10 Members = 11 seats
--
--  `seats` counts rows in workspace_members, which includes the admin, so the
--  stored number is the total rather than the member allowance.
-- ----------------------------------------------------------------------------

create or replace function public.seats_for_plan(p public.workspace_plan)
returns integer
language sql
immutable
set search_path = public
as $$
  select case when p = 'pro' then 11 else 2 end;
$$;

-- Existing rows were provisioned with the old default of 3.
update public.workspaces
   set seats = public.seats_for_plan(plan)
 where seats <> public.seats_for_plan(plan);

alter table public.workspaces alter column seats set default 2;

/*
 * Seats follow the plan automatically. Doing this in a trigger rather than in
 * the webhook means a plan written by *any* path — a manual fix in the SQL
 * editor, a backfill, a future admin tool — can never leave seats inconsistent
 * with what the tenant is paying for.
 */
create or replace function public.sync_seats_with_plan()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.plan is distinct from old.plan then
    new.seats := public.seats_for_plan(new.plan);
  end if;
  return new;
end;
$$;

drop trigger if exists workspaces_sync_seats on public.workspaces;
create trigger workspaces_sync_seats
  before insert or update of plan on public.workspaces
  for each row execute function public.sync_seats_with_plan();

-- ----------------------------------------------------------------------------
--  3. Stripe event ledger (replay protection)
--
--  Stripe retries a webhook until it gets a 2xx, and "at least once" delivery
--  means the same event can arrive twice. Recording the event id inside the
--  same transaction that applies its effect makes processing idempotent: a
--  replay hits the primary key and is skipped.
-- ----------------------------------------------------------------------------

create table if not exists public.stripe_events (
  id           text primary key,
  type         text not null,
  workspace_id uuid references public.workspaces (id) on delete set null,
  received_at  timestamptz not null default now()
);

alter table public.stripe_events enable row level security;
alter table public.stripe_events force row level security;

-- No policies: reachable only through the service role, which bypasses RLS.
-- Stated explicitly so a future reader does not assume a policy was forgotten.

-- ----------------------------------------------------------------------------
--  4. Tokenized workspace invitations
--
--  The raw token is never stored. We keep a SHA-256 hash, so a database leak
--  does not hand an attacker a set of working invitation links — the same
--  reasoning that applies to password hashes.
-- ----------------------------------------------------------------------------

create table if not exists public.workspace_invitations (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  email          text not null,
  token_hash     text not null,
  workspace_role public.workspace_role not null default 'member',
  invited_by     uuid references public.profiles (id) on delete set null,
  expires_at     timestamptz not null,
  accepted_at    timestamptz,
  accepted_by    uuid references public.profiles (id) on delete set null,
  revoked_at     timestamptz,
  created_at     timestamptz not null default now(),
  constraint workspace_invitations_email_lower check (email = lower(email)),
  constraint workspace_invitations_role_check check (workspace_role = 'member')
);

create unique index if not exists workspace_invitations_token_key
  on public.workspace_invitations (token_hash);

create index if not exists workspace_invitations_workspace_idx
  on public.workspace_invitations (workspace_id, created_at desc);

-- One live invitation per address per workspace; re-inviting replaces it.
create unique index if not exists workspace_invitations_pending_key
  on public.workspace_invitations (workspace_id, email)
  where accepted_at is null and revoked_at is null;

alter table public.workspace_invitations enable row level security;
alter table public.workspace_invitations force row level security;

drop policy if exists "invitations: admins read own tenant"
  on public.workspace_invitations;
create policy "invitations: admins read own tenant"
  on public.workspace_invitations
  for select
  to authenticated
  using (
    public.is_super_admin()
    or public.is_workspace_admin(workspace_id)
  );

drop policy if exists "invitations: admins create for own tenant"
  on public.workspace_invitations;
create policy "invitations: admins create for own tenant"
  on public.workspace_invitations
  for insert
  to authenticated
  with check (
    public.is_super_admin()
    or (public.is_workspace_admin(workspace_id) and invited_by = auth.uid())
  );

drop policy if exists "invitations: admins revoke own tenant"
  on public.workspace_invitations;
create policy "invitations: admins revoke own tenant"
  on public.workspace_invitations
  for update
  to authenticated
  using (
    public.is_super_admin()
    or public.is_workspace_admin(workspace_id)
  )
  with check (
    public.is_super_admin()
    or public.is_workspace_admin(workspace_id)
  );

/*
 * Acceptance runs for a user who is not yet a member of the workspace, so it
 * cannot go through the policies above. It is performed by the service role
 * in `lib/team/invitations.ts`, which re-checks expiry, revocation and the
 * seat limit before inserting the membership row.
 */

-- ----------------------------------------------------------------------------
--  5. Daily usage rollup
--
--  Redis owns the real-time quota decision (atomic, sub-millisecond). This
--  table is the durable record behind it: it survives Redis eviction, powers
--  the Super Admin graphs, and lets the quota degrade to a correct — if
--  slower — database counter when Upstash is absent.
-- ----------------------------------------------------------------------------

create table if not exists public.usage_daily (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  day          date not null default (now() at time zone 'utc')::date,
  scans        integer not null default 0 check (scans >= 0),
  tokens       integer not null default 0 check (tokens >= 0),
  ai_calls     integer not null default 0 check (ai_calls >= 0),
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, day)
);

create index if not exists usage_daily_day_idx on public.usage_daily (day desc);

alter table public.usage_daily enable row level security;
alter table public.usage_daily force row level security;

drop policy if exists "usage: members read own tenant" on public.usage_daily;
create policy "usage: members read own tenant"
  on public.usage_daily
  for select
  to authenticated
  using (
    public.is_super_admin()
    or public.is_workspace_member(workspace_id)
  );

-- Writes go through `record_usage()` below, never through a direct insert.

/*
 * Atomic usage increment.
 *
 * `insert ... on conflict do update` is a single statement, so concurrent
 * uploads from the same workspace serialise on the primary key instead of
 * racing through a read-modify-write. Returns the post-increment scan count
 * so the caller can enforce a quota from the same round trip when Redis is
 * unavailable.
 */
create or replace function public.record_usage(
  p_workspace_id uuid,
  p_scans        integer default 0,
  p_tokens       integer default 0,
  p_ai_calls     integer default 0
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_scans integer;
begin
  insert into public.usage_daily as u (workspace_id, day, scans, tokens, ai_calls)
  values (
    p_workspace_id,
    (now() at time zone 'utc')::date,
    greatest(p_scans, 0),
    greatest(p_tokens, 0),
    greatest(p_ai_calls, 0)
  )
  on conflict (workspace_id, day) do update
    set scans      = u.scans + greatest(p_scans, 0),
        tokens     = u.tokens + greatest(p_tokens, 0),
        ai_calls   = u.ai_calls + greatest(p_ai_calls, 0),
        updated_at = now()
  returning u.scans into new_scans;

  return new_scans;
end;
$$;

revoke all on function public.record_usage(uuid, integer, integer, integer) from public;
grant execute on function public.record_usage(uuid, integer, integer, integer)
  to authenticated, service_role;

/*
 * Atomic check-and-consume for the daily scan quota.
 *
 * This is the fallback the app uses when Upstash is not configured. The whole
 * decision is one statement: the `where` clause on `do update` means the row
 * is only incremented while it is still under the limit, and a caller that
 * loses the race gets zero rows back rather than an over-count. No
 * read-then-write window exists for concurrent uploads to slip through.
 *
 * `p_limit` of NULL means unlimited, which still records the scan.
 */
create or replace function public.consume_scan_quota(
  p_workspace_id uuid,
  p_limit        integer
)
returns table (allowed boolean, used integer, quota integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  today      date := (now() at time zone 'utc')::date;
  new_scans  integer;
  cur_scans  integer;
begin
  if p_limit is null then
    return query select true, public.record_usage(p_workspace_id, 1, 0, 0), null::integer;
    return;
  end if;

  insert into public.usage_daily as u (workspace_id, day, scans)
  values (p_workspace_id, today, 1)
  on conflict (workspace_id, day) do update
     set scans = u.scans + 1,
         updated_at = now()
   where u.scans < p_limit
  returning u.scans into new_scans;

  if new_scans is not null then
    return query select true, new_scans, p_limit;
    return;
  end if;

  -- Either the insert conflicted and the guard rejected it, or the row was at
  -- the limit already. Report the current standing.
  select u.scans into cur_scans
    from public.usage_daily u
   where u.workspace_id = p_workspace_id and u.day = today;

  return query select false, coalesce(cur_scans, p_limit), p_limit;
end;
$$;

revoke all on function public.consume_scan_quota(uuid, integer) from public;
grant execute on function public.consume_scan_quota(uuid, integer)
  to authenticated, service_role;

-- ----------------------------------------------------------------------------
--  6. Platform health aggregate for the Super Admin console
--
--  SECURITY DEFINER so it can read across tenants, with the super-admin check
--  inside the function body rather than relying on the caller.
-- ----------------------------------------------------------------------------

create or replace function public.platform_usage_series(p_days integer default 14)
returns table (
  day        date,
  scans      bigint,
  tokens     bigint,
  ai_calls   bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'permission denied: super admin required'
      using errcode = '42501';
  end if;

  return query
  select d::date                              as day,
         coalesce(sum(u.scans), 0)::bigint    as scans,
         coalesce(sum(u.tokens), 0)::bigint   as tokens,
         coalesce(sum(u.ai_calls), 0)::bigint as ai_calls
    from generate_series(
           ((now() at time zone 'utc')::date - (greatest(p_days, 1) - 1)),
           (now() at time zone 'utc')::date,
           interval '1 day'
         ) as d
    left join public.usage_daily u on u.day = d::date
   group by d
   order by d;
end;
$$;

revoke all on function public.platform_usage_series(integer) from public;
grant execute on function public.platform_usage_series(integer) to authenticated;

-- ----------------------------------------------------------------------------
--  7. Per-workspace scan totals, used by the tenant table
-- ----------------------------------------------------------------------------

create or replace function public.workspace_usage_totals(p_workspace_id uuid)
returns table (
  scans_today  integer,
  scans_total  bigint,
  tokens_total bigint
)
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not (public.is_super_admin() or public.is_workspace_member(p_workspace_id)) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  return query
  select
    coalesce(
      (select u.scans from public.usage_daily u
        where u.workspace_id = p_workspace_id
          and u.day = (now() at time zone 'utc')::date),
      0
    )::integer,
    coalesce((select sum(u.scans) from public.usage_daily u
               where u.workspace_id = p_workspace_id), 0)::bigint,
    coalesce((select sum(u.tokens) from public.usage_daily u
               where u.workspace_id = p_workspace_id), 0)::bigint;
end;
$$;

grant execute on function public.workspace_usage_totals(uuid) to authenticated;

-- ----------------------------------------------------------------------------
--  8. Diagnostics
-- ----------------------------------------------------------------------------

create or replace function public.debug_my_billing()
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'workspace_id', public.current_workspace_id(),
    'is_super_admin', public.is_super_admin(),
    'plan', (select w.plan from public.workspaces w
              where w.id = public.current_workspace_id()),
    'seats', (select w.seats from public.workspaces w
               where w.id = public.current_workspace_id()),
    'stripe_customer', (select w.stripe_customer_id is not null
                          from public.workspaces w
                         where w.id = public.current_workspace_id()),
    'scans_today', coalesce(
      (select u.scans from public.usage_daily u
        where u.workspace_id = public.current_workspace_id()
          and u.day = (now() at time zone 'utc')::date), 0)
  );
$$;

grant execute on function public.debug_my_billing() to authenticated;
