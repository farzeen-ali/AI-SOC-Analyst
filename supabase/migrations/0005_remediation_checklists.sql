-- ===================================================================
--  GuardAI — Phase 3
--  Interactive remediation checklists.
--
--  Phase 2 stored remediation as a `jsonb` array on the finding, which is
--  fine for display but cannot carry per-step triage state. This promotes
--  each step to a row so analysts can move it through
--  Pending -> In Progress -> Resolved, with attribution.
--
--  Idempotent: safe to re-run.
-- ===================================================================

do $$ begin
  create type public.remediation_status as enum
    ('pending', 'in_progress', 'resolved');
exception when duplicate_object then null; end $$;

create table if not exists public.finding_remediation_steps (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  finding_id   uuid not null references public.threat_findings (id) on delete cascade,
  step_index   integer not null,
  description  text not null,
  status       public.remediation_status not null default 'pending',
  updated_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (finding_id, step_index)
);

create index if not exists remediation_steps_workspace_idx
  on public.finding_remediation_steps (workspace_id, status);
create index if not exists remediation_steps_finding_idx
  on public.finding_remediation_steps (finding_id, step_index);

drop trigger if exists remediation_steps_touch_updated_at
  on public.finding_remediation_steps;
create trigger remediation_steps_touch_updated_at
  before update on public.finding_remediation_steps
  for each row execute function public.touch_updated_at();

-- -------------------------------------------------------------------
--  Materialise steps from the finding's `remediation` array
--
--  SECURITY DEFINER because the ingestion worker inserts findings with the
--  service role, and because this must also succeed on the backfill below.
--  It only ever writes rows derived from the finding it fires for.
-- -------------------------------------------------------------------

create or replace function public.materialize_remediation_steps()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  step text;
  position integer := 0;
begin
  if new.remediation is null
     or jsonb_typeof(new.remediation) <> 'array' then
    return new;
  end if;

  for step in
    select jsonb_array_elements_text(new.remediation)
  loop
    -- Bound the fan-out: the analysis schema caps remediation at 8 steps,
    -- but the column itself is unconstrained jsonb.
    exit when position >= 20;

    if length(trim(step)) > 0 then
      insert into public.finding_remediation_steps
        (workspace_id, finding_id, step_index, description)
      values
        (new.workspace_id, new.id, position, left(trim(step), 500))
      on conflict (finding_id, step_index) do nothing;
    end if;

    position := position + 1;
  end loop;

  return new;
end;
$$;

drop trigger if exists findings_materialize_steps on public.threat_findings;
create trigger findings_materialize_steps
  after insert on public.threat_findings
  for each row execute function public.materialize_remediation_steps();

-- Backfill findings created before this migration.
do $$
declare
  finding record;
  step text;
  position integer;
begin
  for finding in
    select f.id, f.workspace_id, f.remediation
    from public.threat_findings f
    where not exists (
      select 1 from public.finding_remediation_steps s
      where s.finding_id = f.id
    )
      and jsonb_typeof(f.remediation) = 'array'
  loop
    position := 0;
    for step in select jsonb_array_elements_text(finding.remediation)
    loop
      exit when position >= 20;
      if length(trim(step)) > 0 then
        insert into public.finding_remediation_steps
          (workspace_id, finding_id, step_index, description)
        values
          (finding.workspace_id, finding.id, position, left(trim(step), 500))
        on conflict (finding_id, step_index) do nothing;
      end if;
      position := position + 1;
    end loop;
  end loop;
end $$;

-- -------------------------------------------------------------------
--  Privilege guard
--
--  The UPDATE policy lets any workspace member triage a step. This pins
--  everything except `status`/`updated_by`, so the control cannot be used
--  to rewrite the AI's remediation text or move a step to another tenant.
-- -------------------------------------------------------------------

create or replace function public.guard_remediation_step_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;

  new.id           := old.id;
  new.workspace_id := old.workspace_id;
  new.finding_id   := old.finding_id;
  new.step_index   := old.step_index;
  new.description  := old.description;
  new.created_at   := old.created_at;
  new.updated_by   := (select auth.uid());
  return new;
end;
$$;

drop trigger if exists remediation_steps_guard_fields
  on public.finding_remediation_steps;
create trigger remediation_steps_guard_fields
  before update on public.finding_remediation_steps
  for each row execute function public.guard_remediation_step_fields();

-- -------------------------------------------------------------------
--  Row Level Security
-- -------------------------------------------------------------------

alter table public.finding_remediation_steps enable row level security;
alter table public.finding_remediation_steps force row level security;

drop policy if exists "steps: read own tenant" on public.finding_remediation_steps;
create policy "steps: read own tenant"
  on public.finding_remediation_steps for select to authenticated
  using (
    public.is_super_admin()
    or workspace_id = public.current_workspace_id()
    or public.is_workspace_member(workspace_id)
  );

drop policy if exists "steps: members triage" on public.finding_remediation_steps;
create policy "steps: members triage"
  on public.finding_remediation_steps for update to authenticated
  using (
    public.is_super_admin()
    or public.is_workspace_member(workspace_id)
  )
  with check (
    public.is_super_admin()
    or public.is_workspace_member(workspace_id)
  );

-- No INSERT/DELETE policy for `authenticated`: rows are derived from the
-- finding by the trigger and removed by its ON DELETE CASCADE.

grant select, update on public.finding_remediation_steps to authenticated;

-- -------------------------------------------------------------------
--  Dashboard analytics
--
--  One round trip for the SOC overview instead of several client-side
--  aggregations. SECURITY INVOKER so RLS scopes every count.
-- -------------------------------------------------------------------

create or replace function public.workspace_threat_analytics(target uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'total_findings', (
      select count(*) from public.threat_findings f
      where f.workspace_id = target
    ),
    'open_findings', (
      select count(*) from public.threat_findings f
      where f.workspace_id = target and f.status = 'open'
    ),
    'critical_findings', (
      select count(*) from public.threat_findings f
      where f.workspace_id = target and f.severity_score >= 9
    ),
    'mean_severity', (
      select coalesce(round(avg(f.severity_score)::numeric, 1), 0)
      from public.threat_findings f
      where f.workspace_id = target
    ),
    'max_severity', (
      select coalesce(max(f.severity_score), 0)
      from public.threat_findings f
      where f.workspace_id = target and f.status = 'open'
    ),
    'by_severity', (
      select coalesce(jsonb_object_agg(bucket, total), '{}'::jsonb)
      from (
        select
          case
            when f.severity_score >= 9 then 'critical'
            when f.severity_score >= 7 then 'high'
            when f.severity_score >= 4 then 'medium'
            else 'low'
          end as bucket,
          count(*) as total
        from public.threat_findings f
        where f.workspace_id = target
        group by 1
      ) buckets
    ),
    'by_vector', (
      select coalesce(jsonb_agg(vector_row order by vector_row->>'total' desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'threat_type', f.threat_type,
          'total', count(*),
          'max_severity', max(f.severity_score)
        ) as vector_row
        from public.threat_findings f
        where f.workspace_id = target
        group by f.threat_type
        order by count(*) desc
        limit 8
      ) vectors
    ),
    'steps_by_status', (
      select coalesce(jsonb_object_agg(s.status, s.total), '{}'::jsonb)
      from (
        select status::text as status, count(*) as total
        from public.finding_remediation_steps
        where workspace_id = target
        group by status
      ) s
    )
  );
$$;

grant execute on function public.workspace_threat_analytics(uuid) to authenticated;
