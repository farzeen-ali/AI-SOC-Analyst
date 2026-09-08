-- ===================================================================
--  GuardAI — Phase 2 RLS correction
--
--  Bug: the Phase 2 policies made the `workspace_id` JWT claim the sole
--  authorization source. When the Custom Access Token Hook is not enabled
--  — or the signed-in session still holds a token minted before it was —
--  `public.current_workspace_id()` returns NULL and every Phase 2 write
--  is denied, while Phase 1 keeps working because its policies already
--  fall back to real membership.
--
--  Symptom: "new row violates row-level security policy for table
--  log_files" on upload, with the rest of the app behaving normally.
--
--  Fix: match the Phase 1 shape everywhere. Membership in
--  `workspace_members` is the authority; the claim stays in the policy as
--  the fast path that lets the planner use the composite index first.
--  Isolation is unchanged — `is_workspace_member()` is a SECURITY DEFINER
--  lookup against the real membership table.
--  Idempotent: safe to re-run.
-- ===================================================================

-- ---- log_files ----

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
    -- Authoritative: the caller really is a member of this workspace,
    -- and is filing the upload under their own identity.
    public.is_workspace_member(workspace_id)
    and uploaded_by = (select auth.uid())
  );

-- ---- log_chunks ----

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

-- -------------------------------------------------------------------
--  Self-service diagnostic
--
--  Returns what the *current session's* token actually carries, so a
--  missing hook can be spotted in one query instead of inferred from an
--  RLS denial. Run it from the SQL Editor's "run as authenticated user"
--  mode, or call it from the app.
-- -------------------------------------------------------------------

create or replace function public.debug_my_claims()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'user_id', (select auth.uid()),
    'role', (select auth.role()),
    'workspace_id_claim', public.current_workspace_id(),
    'hook_enabled', public.current_workspace_id() is not null,
    'memberships', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'workspace_id', m.workspace_id,
        'workspace_role', m.workspace_role
      )), '[]'::jsonb)
      from public.workspace_members m
      where m.user_id = (select auth.uid())
    )
  );
$$;

grant execute on function public.debug_my_claims() to authenticated;
