-- ===================================================================
--  GuardAI — Phase 1
--  Multi-tenant schema, profile sync trigger, custom JWT claims, RLS.
--  Idempotent: safe to re-run against an existing project.
-- ===================================================================

create extension if not exists "pgcrypto";

-- -------------------------------------------------------------------
--  Enums
-- -------------------------------------------------------------------

do $$ begin
  create type public.global_role as enum ('super_admin', 'user');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.workspace_role as enum ('tenant_admin', 'member');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.workspace_plan as enum ('free', 'pro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.subscription_status as enum
    ('active', 'trialing', 'past_due', 'cancelled', 'suspended');
exception when duplicate_object then null; end $$;

-- -------------------------------------------------------------------
--  Tables
-- -------------------------------------------------------------------

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  avatar_url  text,
  global_role public.global_role not null default 'user',
  is_suspended boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists profiles_email_key
  on public.profiles (lower(email));

create table if not exists public.workspaces (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  slug                text not null,
  owner_id            uuid not null references public.profiles (id) on delete cascade,
  plan                public.workspace_plan not null default 'free',
  subscription_status public.subscription_status not null default 'trialing',
  is_suspended        boolean not null default false,
  seats               integer not null default 3 check (seats >= 1),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists workspaces_slug_key on public.workspaces (slug);
create index if not exists workspaces_owner_idx on public.workspaces (owner_id);

create table if not exists public.workspace_members (
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  workspace_role public.workspace_role not null default 'member',
  created_at     timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists workspace_members_user_idx
  on public.workspace_members (user_id);

create table if not exists public.audit_logs (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references public.profiles (id) on delete set null,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  action       text not null,
  target_type  text,
  target_id    text,
  metadata     jsonb,
  ip_address   text,
  user_agent   text,
  created_at   timestamptz not null default now()
);

create index if not exists audit_logs_workspace_idx
  on public.audit_logs (workspace_id, created_at desc);
create index if not exists audit_logs_actor_idx
  on public.audit_logs (actor_id, created_at desc);

-- -------------------------------------------------------------------
--  updated_at maintenance
-- -------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists workspaces_touch_updated_at on public.workspaces;
create trigger workspaces_touch_updated_at
  before update on public.workspaces
  for each row execute function public.touch_updated_at();

-- -------------------------------------------------------------------
--  Authorization helpers
--
--  All SECURITY DEFINER with a pinned empty search_path. They read the
--  membership tables directly, which is what lets the RLS policies on
--  those same tables avoid infinite recursion.
-- -------------------------------------------------------------------

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.global_role = 'super_admin'
       from public.profiles p
      where p.id = (select auth.uid())),
    false
  );
$$;

-- The workspace the current session is acting in, taken from the JWT claim
-- injected by custom_access_token_hook.
create or replace function public.current_workspace_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claims', true)::jsonb ->> 'workspace_id',
      ''
    ),
    ''
  )::uuid;
$$;

create or replace function public.is_workspace_member(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.workspace_members m
     where m.workspace_id = target
       and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_workspace_admin(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.workspace_members m
     where m.workspace_id = target
       and m.user_id = (select auth.uid())
       and m.workspace_role = 'tenant_admin'
  );
$$;

-- True when the caller shares at least one workspace with `target_user`.
create or replace function public.shares_workspace_with(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.workspace_members mine
      join public.workspace_members theirs
        on theirs.workspace_id = mine.workspace_id
     where mine.user_id = (select auth.uid())
       and theirs.user_id = target_user
  );
$$;

-- -------------------------------------------------------------------
--  Instant profile synchronisation
--
--  Fires on auth.users insert so a profile (and, for self-signup, a
--  workspace + tenant_admin membership) exists before the very first
--  authenticated request. Removes any window where the UI could read a
--  session whose profile row has not landed yet.
-- -------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta              jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  resolved_name     text;
  resolved_avatar   text;
  requested_ws_name text;
  invited_ws        uuid;
  new_ws_id         uuid;
  base_slug         text;
  candidate_slug    text;
  suffix            integer := 0;
begin
  resolved_name := nullif(trim(coalesce(
    meta ->> 'full_name',
    meta ->> 'name',
    split_part(new.email, '@', 1)
  )), '');

  resolved_avatar := nullif(trim(coalesce(
    meta ->> 'avatar_url',
    meta ->> 'picture'
  )), '');

  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, lower(new.email), resolved_name, resolved_avatar)
  on conflict (id) do update
    set email      = excluded.email,
        full_name  = coalesce(public.profiles.full_name, excluded.full_name),
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);

  -- Invited member: join the inviting workspace, never provision a new one.
  invited_ws := nullif(meta ->> 'invited_workspace_id', '')::uuid;
  if invited_ws is not null then
    insert into public.workspace_members (workspace_id, user_id, workspace_role)
    values (invited_ws, new.id, 'member')
    on conflict (workspace_id, user_id) do nothing;
    return new;
  end if;

  -- Self-signup (email/password or OAuth): provision a workspace and make
  -- the signing-up user its tenant_admin.
  requested_ws_name := nullif(trim(coalesce(
    meta ->> 'workspace_name',
    resolved_name || '''s Workspace'
  )), '');

  if requested_ws_name is null then
    requested_ws_name := 'My Workspace';
  end if;

  base_slug := regexp_replace(lower(requested_ws_name), '[^a-z0-9]+', '-', 'g');
  base_slug := trim(both '-' from base_slug);
  if base_slug = '' then
    base_slug := 'workspace';
  end if;
  base_slug := left(base_slug, 40);

  candidate_slug := base_slug;
  while exists (select 1 from public.workspaces w where w.slug = candidate_slug) loop
    suffix := suffix + 1;
    candidate_slug := left(base_slug, 40) || '-' || suffix::text;
  end loop;

  insert into public.workspaces (name, slug, owner_id)
  values (requested_ws_name, candidate_slug, new.id)
  returning id into new_ws_id;

  insert into public.workspace_members (workspace_id, user_id, workspace_role)
  values (new_ws_id, new.id, 'tenant_admin')
  on conflict (workspace_id, user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep the profile email in step with auth.users after a verified change.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles
       set email = lower(new.email)
     where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- -------------------------------------------------------------------
--  Privilege escalation guard
--
--  RLS lets a user update their own profile row. This stops that row
--  from being used to grant themselves super_admin or lift a suspension.
-- -------------------------------------------------------------------

create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- service_role (server-side admin actions) and super admins may change them.
  if (select auth.role()) = 'service_role' or public.is_super_admin() then
    return new;
  end if;

  new.global_role  := old.global_role;
  new.is_suspended := old.is_suspended;
  new.id           := old.id;
  return new;
end;
$$;

drop trigger if exists profiles_guard_privileges on public.profiles;
create trigger profiles_guard_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- -------------------------------------------------------------------
--  Custom access token hook
--
--  Embeds workspace_id / workspace_role / global_role into every access
--  token so RLS and the Next.js proxy can authorize without a round trip.
--  Enable it in Dashboard → Authentication → Hooks → Customize Access Token.
-- -------------------------------------------------------------------

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims     jsonb;
  uid        uuid;
  g_role     public.global_role;
  suspended  boolean;
  ws_id      uuid;
  ws_role    public.workspace_role;
begin
  uid := (event ->> 'user_id')::uuid;
  claims := coalesce(event -> 'claims', '{}'::jsonb);

  select p.global_role, p.is_suspended
    into g_role, suspended
    from public.profiles p
   where p.id = uid;

  -- Oldest membership wins as the active workspace. Phase 2 will let a
  -- multi-workspace user switch, which re-issues the token with a new claim.
  select m.workspace_id, m.workspace_role
    into ws_id, ws_role
    from public.workspace_members m
    join public.workspaces w on w.id = m.workspace_id
   where m.user_id = uid
     and w.is_suspended = false
   order by m.created_at asc
   limit 1;

  claims := jsonb_set(claims, '{global_role}',
                      to_jsonb(coalesce(g_role, 'user'::public.global_role)));
  claims := jsonb_set(claims, '{is_suspended}',
                      to_jsonb(coalesce(suspended, false)));
  claims := jsonb_set(claims, '{workspace_id}',
                      coalesce(to_jsonb(ws_id), 'null'::jsonb));
  claims := jsonb_set(claims, '{workspace_role}',
                      coalesce(to_jsonb(ws_role), 'null'::jsonb));

  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb)
  to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb)
  from authenticated, anon, public;
grant select on public.profiles, public.workspaces, public.workspace_members
  to supabase_auth_admin;

-- -------------------------------------------------------------------
--  Row Level Security
-- -------------------------------------------------------------------

alter table public.profiles          enable row level security;
alter table public.workspaces        enable row level security;
alter table public.workspace_members enable row level security;
alter table public.audit_logs        enable row level security;

alter table public.profiles          force row level security;
alter table public.workspaces        force row level security;
alter table public.workspace_members force row level security;
alter table public.audit_logs        force row level security;

-- The auth server reads these tables while minting a token.
drop policy if exists "auth admin reads profiles" on public.profiles;
create policy "auth admin reads profiles"
  on public.profiles for select to supabase_auth_admin using (true);

drop policy if exists "auth admin reads workspaces" on public.workspaces;
create policy "auth admin reads workspaces"
  on public.workspaces for select to supabase_auth_admin using (true);

drop policy if exists "auth admin reads memberships" on public.workspace_members;
create policy "auth admin reads memberships"
  on public.workspace_members for select to supabase_auth_admin using (true);

-- ---- profiles ----

drop policy if exists "profiles: read self, teammates, or all as super admin"
  on public.profiles;
create policy "profiles: read self, teammates, or all as super admin"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or public.is_super_admin()
    or public.shares_workspace_with(id)
  );

drop policy if exists "profiles: update own row" on public.profiles;
create policy "profiles: update own row"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) or public.is_super_admin())
  with check (id = (select auth.uid()) or public.is_super_admin());

drop policy if exists "profiles: super admin deletes" on public.profiles;
create policy "profiles: super admin deletes"
  on public.profiles for delete to authenticated
  using (public.is_super_admin());

-- ---- workspaces ----

drop policy if exists "workspaces: read own tenant" on public.workspaces;
create policy "workspaces: read own tenant"
  on public.workspaces for select to authenticated
  using (
    public.is_super_admin()
    or (id = public.current_workspace_id() and public.is_workspace_member(id))
    or public.is_workspace_member(id)
  );

drop policy if exists "workspaces: owner creates" on public.workspaces;
create policy "workspaces: owner creates"
  on public.workspaces for insert to authenticated
  with check (owner_id = (select auth.uid()) or public.is_super_admin());

drop policy if exists "workspaces: tenant admin updates" on public.workspaces;
create policy "workspaces: tenant admin updates"
  on public.workspaces for update to authenticated
  using (public.is_super_admin() or public.is_workspace_admin(id))
  with check (public.is_super_admin() or public.is_workspace_admin(id));

drop policy if exists "workspaces: super admin deletes" on public.workspaces;
create policy "workspaces: super admin deletes"
  on public.workspaces for delete to authenticated
  using (public.is_super_admin());

-- ---- workspace_members ----

drop policy if exists "members: read own tenant" on public.workspace_members;
create policy "members: read own tenant"
  on public.workspace_members for select to authenticated
  using (
    public.is_super_admin()
    or user_id = (select auth.uid())
    or public.is_workspace_member(workspace_id)
  );

drop policy if exists "members: tenant admin writes" on public.workspace_members;
create policy "members: tenant admin writes"
  on public.workspace_members for insert to authenticated
  with check (public.is_super_admin() or public.is_workspace_admin(workspace_id));

drop policy if exists "members: tenant admin updates" on public.workspace_members;
create policy "members: tenant admin updates"
  on public.workspace_members for update to authenticated
  using (public.is_super_admin() or public.is_workspace_admin(workspace_id))
  with check (public.is_super_admin() or public.is_workspace_admin(workspace_id));

drop policy if exists "members: tenant admin removes" on public.workspace_members;
create policy "members: tenant admin removes"
  on public.workspace_members for delete to authenticated
  using (public.is_super_admin() or public.is_workspace_admin(workspace_id));

-- ---- audit_logs ----
-- Writes go through service_role only, so there is deliberately no
-- INSERT policy for `authenticated`.

drop policy if exists "audit: super admin or tenant admin reads" on public.audit_logs;
create policy "audit: super admin or tenant admin reads"
  on public.audit_logs for select to authenticated
  using (
    public.is_super_admin()
    or (workspace_id is not null and public.is_workspace_admin(workspace_id))
  );

-- -------------------------------------------------------------------
--  Grants (RLS still applies on top of these)
-- -------------------------------------------------------------------

grant usage on schema public to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.workspaces to authenticated;
grant select, insert, update, delete on public.workspace_members to authenticated;
grant select on public.audit_logs to authenticated;

grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.current_workspace_id() to authenticated;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.is_workspace_admin(uuid) to authenticated;
grant execute on function public.shares_workspace_with(uuid) to authenticated;
