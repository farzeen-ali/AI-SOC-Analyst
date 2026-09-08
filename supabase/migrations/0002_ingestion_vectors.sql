-- ===================================================================
--  GuardAI — Phase 2
--  Log ingestion pipeline, pgvector store, and RAG threat findings.
--  Idempotent: safe to re-run against an existing project.
-- ===================================================================

create extension if not exists "vector";

-- -------------------------------------------------------------------
--  Enums
-- -------------------------------------------------------------------

do $$ begin
  create type public.log_format as enum ('json', 'csv', 'syslog', 'plaintext');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ingest_status as enum (
    'pending',    -- row created, waiting for the client to upload
    'queued',     -- object confirmed, job published
    'parsing',    -- worker is normalising + masking
    'embedding',  -- chunks written, vectors being generated
    'analyzing',  -- RAG pass in flight
    'completed',
    'failed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.finding_status as enum
    ('open', 'acknowledged', 'resolved', 'dismissed');
exception when duplicate_object then null; end $$;

-- -------------------------------------------------------------------
--  Tables
-- -------------------------------------------------------------------

create table if not exists public.log_files (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  uploaded_by    uuid references public.profiles (id) on delete set null,
  filename       text not null,
  storage_path   text not null,
  mime_type      text not null,
  size_bytes     bigint not null check (size_bytes >= 0),
  format         public.log_format not null,
  status         public.ingest_status not null default 'pending',
  error_message  text,
  event_count    integer not null default 0,
  chunk_count    integer not null default 0,
  masked_count   integer not null default 0,
  checksum       text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  processed_at   timestamptz
);

create unique index if not exists log_files_storage_path_key
  on public.log_files (storage_path);
create index if not exists log_files_workspace_created_idx
  on public.log_files (workspace_id, created_at desc);
create index if not exists log_files_status_idx
  on public.log_files (workspace_id, status);

drop trigger if exists log_files_touch_updated_at on public.log_files;
create trigger log_files_touch_updated_at
  before update on public.log_files
  for each row execute function public.touch_updated_at();

-- Embedded, PII-masked chunks. `content` is already sanitised at write time.
create table if not exists public.log_chunks (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  file_id       uuid not null references public.log_files (id) on delete cascade,
  chunk_index   integer not null,
  content       text not null,
  token_estimate integer not null default 0,
  metadata      jsonb not null default '{}'::jsonb,
  embedding     vector(1536),
  created_at    timestamptz not null default now(),
  unique (file_id, chunk_index)
);

-- Composite btree drives the tenant filter; HNSW drives the distance ordering.
create index if not exists log_chunks_workspace_file_idx
  on public.log_chunks (workspace_id, file_id);
create index if not exists log_chunks_workspace_created_idx
  on public.log_chunks (workspace_id, created_at desc);

-- Cosine HNSW. `m`/`ef_construction` tuned for recall on log-shaped text.
create index if not exists log_chunks_embedding_hnsw_idx
  on public.log_chunks using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

create table if not exists public.threat_findings (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  file_id        uuid references public.log_files (id) on delete cascade,
  title          text not null,
  threat_type    text not null,
  severity_score integer not null check (severity_score between 1 and 10),
  confidence     numeric(3, 2) not null default 0.5
                 check (confidence >= 0 and confidence <= 1),
  explanation    text not null,
  remediation    jsonb not null default '[]'::jsonb,
  indicators     jsonb not null default '[]'::jsonb,
  mitre_techniques jsonb not null default '[]'::jsonb,
  evidence_chunk_ids uuid[] not null default '{}',
  status         public.finding_status not null default 'open',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists threat_findings_workspace_idx
  on public.threat_findings (workspace_id, created_at desc);
create index if not exists threat_findings_severity_idx
  on public.threat_findings (workspace_id, severity_score desc);
create index if not exists threat_findings_status_idx
  on public.threat_findings (workspace_id, status);

drop trigger if exists threat_findings_touch_updated_at on public.threat_findings;
create trigger threat_findings_touch_updated_at
  before update on public.threat_findings
  for each row execute function public.touch_updated_at();

-- -------------------------------------------------------------------
--  Vector similarity search
--
--  SECURITY INVOKER on purpose: the function runs as the caller, so the
--  RLS policies below are what actually scope results to one tenant.
--  The explicit workspace predicate is belt-and-braces and lets the
--  planner use the composite btree before ranking by distance.
-- -------------------------------------------------------------------

create or replace function public.match_log_chunks(
  query_embedding vector(1536),
  filter_workspace uuid,
  match_count int default 8,
  similarity_threshold float default 0.0,
  filter_file uuid default null
)
returns table (
  id uuid,
  file_id uuid,
  chunk_index integer,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
stable
security invoker
-- Must include the schema holding the `vector` extension: the `<=>` operator
-- is resolved through the search path and cannot be dot-qualified. Supabase
-- installs it into `extensions` or `public` depending on project age; a schema
-- that does not exist is skipped. Safe because this is SECURITY INVOKER.
set search_path = public, extensions
as $$
begin
  -- pgvector >= 0.8 keeps HNSW recall correct when a WHERE clause filters
  -- most rows out. Older builds simply do not expose the GUC.
  begin
    perform set_config('hnsw.iterative_scan', 'relaxed_order', true);
  exception when others then
    null;
  end;

  return query
  select
    c.id,
    c.file_id,
    c.chunk_index,
    c.content,
    c.metadata,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.log_chunks c
  where c.workspace_id = filter_workspace
    and c.embedding is not null
    and (filter_file is null or c.file_id = filter_file)
    and 1 - (c.embedding <=> query_embedding) >= similarity_threshold
  order by c.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 50);
end;
$$;

-- -------------------------------------------------------------------
--  Usage accounting (drives plan quotas without leaking other tenants)
-- -------------------------------------------------------------------

create or replace function public.workspace_ingest_usage(target uuid)
returns table (
  files_total bigint,
  bytes_total bigint,
  files_last_24h bigint,
  bytes_last_24h bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*)::bigint,
    coalesce(sum(f.size_bytes), 0)::bigint,
    count(*) filter (where f.created_at > now() - interval '24 hours')::bigint,
    coalesce(sum(f.size_bytes) filter
      (where f.created_at > now() - interval '24 hours'), 0)::bigint
  from public.log_files f
  where f.workspace_id = target
    and f.status <> 'failed';
$$;

-- -------------------------------------------------------------------
--  Row Level Security
-- -------------------------------------------------------------------

alter table public.log_files       enable row level security;
alter table public.log_chunks      enable row level security;
alter table public.threat_findings enable row level security;

alter table public.log_files       force row level security;
alter table public.log_chunks      force row level security;
alter table public.threat_findings force row level security;

-- ---- log_files ----
-- Every workspace member may upload and read; only admins may delete.

drop policy if exists "log_files: read own tenant" on public.log_files;
create policy "log_files: read own tenant"
  on public.log_files for select to authenticated
  using (
    public.is_super_admin()
    or workspace_id = public.current_workspace_id()
    or public.is_workspace_member(workspace_id)
  );

drop policy if exists "log_files: members upload" on public.log_files;
create policy "log_files: members upload"
  on public.log_files for insert to authenticated
  with check (
    public.is_workspace_member(workspace_id)
    and uploaded_by = (select auth.uid())
  );

drop policy if exists "log_files: tenant admin deletes" on public.log_files;
create policy "log_files: tenant admin deletes"
  on public.log_files for delete to authenticated
  using (public.is_super_admin() or public.is_workspace_admin(workspace_id));

-- Status transitions are written by the worker through the service role,
-- so `authenticated` deliberately has no UPDATE policy here.

-- ---- log_chunks ----
-- Read-only for tenants. All writes come from the ingestion worker.

drop policy if exists "log_chunks: read own tenant" on public.log_chunks;
create policy "log_chunks: read own tenant"
  on public.log_chunks for select to authenticated
  using (
    public.is_super_admin()
    or workspace_id = public.current_workspace_id()
    or public.is_workspace_member(workspace_id)
  );

-- ---- threat_findings ----

drop policy if exists "findings: read own tenant" on public.threat_findings;
create policy "findings: read own tenant"
  on public.threat_findings for select to authenticated
  using (
    public.is_super_admin()
    or workspace_id = public.current_workspace_id()
    or public.is_workspace_member(workspace_id)
  );

-- Analysts may triage a finding (status only — the privilege guard below
-- pins every other column).
drop policy if exists "findings: members triage" on public.threat_findings;
create policy "findings: members triage"
  on public.threat_findings for update to authenticated
  using (
    public.is_super_admin()
    or public.is_workspace_member(workspace_id)
  )
  with check (
    public.is_super_admin()
    or public.is_workspace_member(workspace_id)
  );

-- Stops a triage UPDATE from rewriting the AI verdict or moving a finding
-- into another tenant.
create or replace function public.guard_finding_immutable_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;

  new.id                 := old.id;
  new.workspace_id       := old.workspace_id;
  new.file_id            := old.file_id;
  new.title              := old.title;
  new.threat_type        := old.threat_type;
  new.severity_score     := old.severity_score;
  new.confidence         := old.confidence;
  new.explanation        := old.explanation;
  new.remediation        := old.remediation;
  new.indicators         := old.indicators;
  new.mitre_techniques   := old.mitre_techniques;
  new.evidence_chunk_ids := old.evidence_chunk_ids;
  new.created_at         := old.created_at;
  return new;
end;
$$;

drop trigger if exists findings_guard_immutable on public.threat_findings;
create trigger findings_guard_immutable
  before update on public.threat_findings
  for each row execute function public.guard_finding_immutable_fields();

-- -------------------------------------------------------------------
--  Grants
-- -------------------------------------------------------------------

grant select, insert, delete on public.log_files to authenticated;
grant select on public.log_chunks to authenticated;
grant select, update on public.threat_findings to authenticated;

grant execute on function
  public.match_log_chunks(vector, uuid, int, float, uuid) to authenticated;
grant execute on function public.workspace_ingest_usage(uuid) to authenticated;

-- -------------------------------------------------------------------
--  Storage: private bucket, one prefix per workspace
-- -------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('security-logs', 'security-logs', false, 104857600)
on conflict (id) do update
  set public = false,
      file_size_limit = 104857600;

-- Objects live at `<workspace_id>/<file_id>-<slug>`, so the first path
-- segment is the tenant boundary.
drop policy if exists "security-logs: members read own tenant" on storage.objects;
create policy "security-logs: members read own tenant"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'security-logs'
    and public.is_workspace_member(
      nullif((storage.foldername(name))[1], '')::uuid
    )
  );

drop policy if exists "security-logs: members upload own tenant" on storage.objects;
create policy "security-logs: members upload own tenant"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'security-logs'
    and public.is_workspace_member(
      nullif((storage.foldername(name))[1], '')::uuid
    )
  );

drop policy if exists "security-logs: tenant admin deletes" on storage.objects;
create policy "security-logs: tenant admin deletes"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'security-logs'
    and public.is_workspace_admin(
      nullif((storage.foldername(name))[1], '')::uuid
    )
  );
