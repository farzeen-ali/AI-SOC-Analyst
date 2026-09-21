-- ===================================================================
--  GuardAI — MFA support (TOTP + WebAuthn)
--
--  Supabase already puts an `aal` claim (aal1 / aal2) in every access
--  token. What the app also needs, cheaply, is whether the account has a
--  *verified* factor at all — otherwise the proxy cannot tell
--  "no MFA configured" apart from "MFA configured but not yet satisfied"
--  without a database round trip on every request.
--
--  This extends the access-token hook with `has_mfa`, so route gating is
--  a pure claim check against a signed token.
--
--  Idempotent: safe to re-run.
-- ===================================================================

-- The hook runs as supabase_auth_admin; make the read explicit rather
-- than relying on ownership.
grant usage on schema auth to supabase_auth_admin;
grant select on auth.mfa_factors to supabase_auth_admin;

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
  mfa_ready  boolean := false;
begin
  uid := (event ->> 'user_id')::uuid;
  claims := coalesce(event -> 'claims', '{}'::jsonb);

  select p.global_role, p.is_suspended
    into g_role, suspended
    from public.profiles p
   where p.id = uid;

  -- Oldest membership wins as the active workspace. A later phase lets a
  -- multi-workspace user switch, which re-issues the token with a new claim.
  select m.workspace_id, m.workspace_role
    into ws_id, ws_role
    from public.workspace_members m
    join public.workspaces w on w.id = m.workspace_id
   where m.user_id = uid
     and w.is_suspended = false
   order by m.created_at asc
   limit 1;

  -- Does this account have at least one verified MFA factor? Wrapped so a
  -- permissions problem degrades to "no MFA" rather than breaking sign-in
  -- for everyone.
  begin
    select exists (
      select 1
        from auth.mfa_factors f
       where f.user_id = uid
         and f.status = 'verified'
    ) into mfa_ready;
  exception when others then
    mfa_ready := false;
  end;

  claims := jsonb_set(claims, '{global_role}',
                      to_jsonb(coalesce(g_role, 'user'::public.global_role)));
  claims := jsonb_set(claims, '{is_suspended}',
                      to_jsonb(coalesce(suspended, false)));
  claims := jsonb_set(claims, '{workspace_id}',
                      coalesce(to_jsonb(ws_id), 'null'::jsonb));
  claims := jsonb_set(claims, '{workspace_role}',
                      coalesce(to_jsonb(ws_role), 'null'::jsonb));
  claims := jsonb_set(claims, '{has_mfa}', to_jsonb(mfa_ready));

  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb)
  to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb)
  from authenticated, anon, public;

-- -------------------------------------------------------------------
--  Diagnostic
-- -------------------------------------------------------------------

create or replace function public.debug_my_mfa()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'user_id', (select auth.uid()),
    'aal_claim', current_setting('request.jwt.claims', true)::jsonb ->> 'aal',
    'has_mfa_claim',
      current_setting('request.jwt.claims', true)::jsonb ->> 'has_mfa'
  );
$$;

grant execute on function public.debug_my_mfa() to authenticated;
