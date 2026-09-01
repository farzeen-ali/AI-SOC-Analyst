# GuardAI

An AI-powered SOC analyst SaaS platform. This repository contains **Phase 1 —
Authentication, RBAC, Multi-Tenancy, and the Security Baseline**.

Built with Next.js 16 (App Router), Tailwind CSS v4, shadcn/ui (Base UI),
Framer Motion, Supabase, and Upstash Redis.

---

## What Phase 1 delivers

### Authentication
- **Sign up** — full name, work email, password, confirm password, workspace
  name. Strict RegEx + Zod validation on the client and again on the server.
- **Google OAuth** — auto-provisions a workspace for first-time users.
- **Login** — email, password, "Remember me", role-based redirect
  (`/super-admin` for platform owners, `/dashboard` for everyone else).
- **Brute-force lockout** — 15-minute lock after 5 consecutive failed
  attempts, keyed by email so rotating IPs does not help.
- **Password reset** — 6-digit OTP flow across three screens: request → verify
  → set new password. Max 3 code requests per 15 minutes, 60-second resend
  cooldown.
- **Logout** — available from the avatar dropdown, the sidebar footer, and
  Profile & Security. Revokes the refresh token globally, clears the `sb-*`
  cookies, invalidates the route cache, and blocks back-navigation to cached
  authenticated pages.

### Multi-tenancy & RBAC
- Three roles: **Super Admin**, **Tenant Admin**, **SOC Analyst (Member)**.
- A PostgreSQL trigger (`on_auth_user_created`) creates the profile,
  workspace, and `tenant_admin` membership atomically at sign-up — there is no
  window where a session exists without its profile.
- A **Custom Access Token Hook** embeds `workspace_id`, `workspace_role`,
  `global_role`, and `is_suspended` into every JWT.
- **Row Level Security** is enabled *and forced* on every table. Policies
  filter on the signed claim and intersect it with real membership, so a stale
  claim cannot widen access.
- Super Admin console: platform metrics, tenant list, user list, audit log,
  and one-click suspend / reinstate.

### Security baseline
| Control | Where |
| --- | --- |
| Zod schemas, shared client + server | `lib/validations/auth.ts` |
| Input sanitisation (control/invisible/tag stripping) | `lib/security/sanitize.ts` |
| Rate limiting, per IP **and** per identity | `lib/security/rate-limit.ts` |
| Brute-force lockout | `lib/security/lockout.ts` |
| Route guarding | `proxy.ts` (Next 16's renamed middleware) |
| Authoritative authorization | `lib/auth/dal.ts` |
| CSRF defence-in-depth (origin check) | `lib/security/request.ts` |
| RLS policies, trigger, JWT hook | `supabase/migrations/0001_init.sql` |

---

## Setup

### 1. Install and configure

```bash
npm install
```

Copy the environment template and fill it in:

```bash
cp .env.example .env.local
```

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-only. Bypasses RLS. |
| `NEXT_PUBLIC_SITE_URL` | yes | Origin for OAuth and email redirects |
| `UPSTASH_REDIS_REST_URL` | prod | Dev falls back to an in-process counter |
| `UPSTASH_REDIS_REST_TOKEN` | prod | Same |

> Without Upstash, rate limits and lockouts are single-process only and reset
> on reload. `lib/redis.ts` throws in production rather than degrade silently.

### 2. Run the database migration

Paste `supabase/migrations/0001_init.sql` into the Supabase SQL Editor and run
it, or apply it with the CLI. It is idempotent — safe to re-run.

### 3. Enable the Custom Access Token Hook

**Dashboard → Authentication → Hooks → Customize Access Token (JWT) Claims** →
select `public.custom_access_token_hook` and enable it.

Without this step the JWT carries no `workspace_id`, and every RLS policy that
scopes by workspace will correctly deny access.

### 4. Switch the recovery email to a 6-digit code

**Dashboard → Authentication → Email Templates → Reset Password**. Replace the
magic-link body with the token variable so the OTP screen has a code to verify:

```html
<h2>Reset your GuardAI password</h2>
<p>Your verification code is:</p>
<p style="font-size:28px;letter-spacing:6px;font-weight:700">{{ .Token }}</p>
<p>This code expires in 10 minutes. If you did not request it, ignore this email.</p>
```

### 5. Configure Google OAuth (optional)

**Dashboard → Authentication → Providers → Google.** Add
`https://<your-project-ref>.supabase.co/auth/v1/callback` as an authorised
redirect URI in the Google Cloud console, and add
`{NEXT_PUBLIC_SITE_URL}/auth/callback` to Supabase's **Redirect URLs**.

### 6. Create the first Super Admin

Sign up normally, then promote the account in the SQL Editor:

```sql
update public.profiles
   set global_role = 'super_admin'
 where email = 'you@example.com';
```

Sign out and back in so a new token is minted with the updated claim.

### 7. Start

```bash
npm run dev
```

---

## Project structure

```
app/
  (auth)/            login, signup, forgot-password, verify-otp,
                     reset-password, check-email  — shared split-screen shell
  auth/callback/     OAuth + email-link exchange
  dashboard/         workspace console (role-gated layout)
  settings/profile/  account screen, open to every role
  super-admin/       platform console (super-admin only)
components/
  auth/              form fields, OTP input, strength meter, threat feed
  dashboard/         shell, sidebar, user menu, logout, stat cards
  marketing/         landing page sections
  ui/                shadcn/ui primitives (Base UI)
lib/
  auth/              DAL, Server Actions, audit trail
  security/          rate limiting, lockout, sanitisation, request helpers
  supabase/          browser / server / proxy / service-role clients
  validations/       Zod schemas and RegEx primitives
proxy.ts             route guard (Next 16 renamed middleware → proxy)
supabase/migrations/ schema, trigger, JWT hook, RLS policies
```

---

## Deliberate scope decisions

- **Account deletion is not exposed** in the Super Admin console. Suspension
  covers the "Suspend / Ban" requirement, is reversible, and immediately
  force-logs-out the account by banning its auth record. Irreversible deletion
  needs a confirmation flow and a retention policy, which belong with the
  billing and data-retention work.
- **Team invitations, billing checkout, MFA enrolment, workspace rename, and
  API keys** are Phase 2. Their routes, role guards, and navigation entries are
  real and enforced; only the feature bodies are marked as pending.
- **Legal pages** (`/privacy`, `/terms`) are structural placeholders and say so
  on the page. Replace them with reviewed wording before production.
- **Landing, pricing, and security pages** were added so the auth flows have a
  coherent product around them and no navigation link 404s.

## Phase 2

Log ingestion, RAG-based threat analysis, remediation playbooks, Lemon Squeezy
billing, team invitations, and MFA.
