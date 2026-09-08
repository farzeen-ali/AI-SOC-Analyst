# GuardAI

An AI-powered SOC analyst SaaS platform.

- **Phase 1** — Authentication, RBAC, Multi-Tenancy, and the Security Baseline
- **Phase 2** — Asynchronous log ingestion, pgvector store, and the RAG threat engine

Built with Next.js 16 (App Router), Tailwind CSS v4, shadcn/ui (Base UI),
Framer Motion, Supabase (Postgres + pgvector + Storage), Upstash Redis and
QStash, and the Vercel AI SDK on OpenAI.

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

## What Phase 2 delivers

### Asynchronous ingestion pipeline
- **Drag & drop upload** accepting `.json` / `.ndjson`, `.csv` / `.tsv`,
  `.syslog`, and `.log` / `.txt`, with live progress, a per-file pipeline
  view, and structured validation errors for malformed logs.
- **Size limits per tier** — Free 10 MB, Pro 100 MB — enforced when the upload
  ticket is issued *and* re-checked against the real object at commit time, so
  a small ticket cannot be used to push a large file.
- **Direct-to-storage upload.** Bytes go from the browser to a private Supabase
  bucket through a signed, server-issued URL under a `workspace_id/` prefix.
  Nothing large streams through the Next.js server.
- **Off the event loop.** Parsing, PII masking, chunking, and embedding run in
  a QStash worker (`/api/jobs/process-log`), not on the request. Locally it
  falls back to Next's `after()` — still off the response path.
- **PII masked before anything is persisted or sent to OpenAI.** Emails, cards
  (Luhn-checked), SSNs, IPs, MACs, phone numbers, JWTs, AWS keys, private keys,
  and `password=`-style assignments. Masking is shape-preserving: equal inputs
  produce equal pseudonyms, so analysts can still correlate.

### Vector store
- **pgvector** with 1536-dimension `text-embedding-3-small` embeddings stored
  directly in Postgres.
- **HNSW cosine index** (`m=16, ef_construction=64`) alongside a composite
  `(workspace_id, file_id)` btree. `match_log_chunks` is `SECURITY INVOKER`, so
  RLS scopes results; the explicit workspace predicate lets the planner use the
  btree before ranking by distance, and `hnsw.iterative_scan` keeps recall
  correct under that filter.
- **Overlapping chunking** on whole log lines, so a multi-line attack sequence
  stays retrievable even when it straddles a chunk boundary.

### RAG threat engine
- A fixed set of threat probes sweeps each ingested file by cosine similarity,
  and the merged, de-duplicated context is handed to the model.
- **Structured output** via the Vercel AI SDK's `generateObject`, validated by
  Zod: threat type, severity 1–10, confidence, explanation, ordered
  remediation steps, IOCs, and MITRE technique IDs.
- **Prompt-injection hardened.** Log content is fenced in a delimited block and
  the system prompt states it is data, never instructions. Model output drives
  nothing but a row in `threat_findings`.

### Phase 2 security notes
| Control | Where |
| --- | --- |
| Signed upload tickets, server-generated paths | `app/api/ingest/prepare/route.ts` |
| Real object size verification before queueing | `app/api/ingest/commit/route.ts` |
| QStash signature auth on the public worker | `lib/queue/qstash.ts` |
| PII masking | `lib/ingest/pii.ts` |
| Content sniffing, CSV formula injection, prototype pollution, ANSI escapes | `lib/ingest/parse.ts` |
| Bounded events / lines / chunks per file | `lib/ingest/constants.ts` |
| Findings immutable except `status` | `guard_finding_immutable_fields` trigger |

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
| `OPENAI_API_KEY` | yes | Embeddings + threat analysis |
| `QSTASH_TOKEN` | prod | Dev falls back to `after()` — see note below |
| `QSTASH_CURRENT_SIGNING_KEY` | prod | Verifies worker callbacks |
| `QSTASH_NEXT_SIGNING_KEY` | prod | Key rotation |

> Without Upstash, rate limits and lockouts are single-process only and reset
> on reload. `lib/redis.ts` throws in production rather than degrade silently.

### 2. Run the database migrations

Paste each file in `supabase/migrations/` into the Supabase SQL Editor **in
order**, or apply them with the CLI. Both are idempotent — safe to re-run.

| File | Adds |
| --- | --- |
| `0001_init.sql` | Profiles, workspaces, memberships, audit log, JWT hook, RLS |
| `0002_ingestion_vectors.sql` | pgvector, `log_files`, `log_chunks`, `threat_findings`, the similarity RPC, HNSW index, and the private `security-logs` storage bucket |
| `0003_fix_ingestion_rls.sql` | Corrects the Phase 2 policies so membership authorises and the JWT claim only scopes, plus `debug_my_claims()` |
| `0004_fix_vector_operator_search_path.sql` | Lets `match_log_chunks` resolve pgvector's `<=>` operator, plus `debug_vector_ops()` |

> **If ingestion fails with "operator does not exist: vector <=> vector"**,
> `0004` has not been applied. The `<=>` operator is resolved through the
> search path and cannot be schema-qualified, so the RPC needs the schema
> holding the `vector` extension on its path. Check it with:
>
> ```sql
> select public.debug_vector_ops();
> ```
>
> A failed file keeps its uploaded bytes — use **Retry** on the row in
> `/dashboard/logs` rather than uploading again.

> **If an upload fails with "new row violates row-level security policy for
> table log_files"**, `0003` has not been applied. Run it, then sign out and
> back in. To see what your session's token actually carries:
>
> ```sql
> select public.debug_my_claims();
> ```
>
> `hook_enabled: false` means the Custom Access Token Hook in step 3 is off —
> the app still works, but workspace scoping falls back to a membership lookup
> on every query instead of reading the signed claim.

> **Background jobs on localhost.** QStash delivers work by calling your app
> back over the public internet, so it cannot reach `http://localhost:3000` and
> rejects the publish with *"endpoint resolves to a loopback address"*. GuardAI
> detects that — a loopback or private-network `NEXT_PUBLIC_SITE_URL` means the
> queue is treated as unavailable and ingestion runs through Next's `after()`
> instead, still off the response path but not durable or retried. You will see
> `[ingest] queue unreachable; processing … locally via after()` in the dev log.
> To exercise the real queue locally, expose the app with a tunnel (ngrok,
> Cloudflare Tunnel) and point `NEXT_PUBLIC_SITE_URL` at the public hostname.
> In production a loopback site URL is a hard error rather than a silent
> downgrade.

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
  api/ingest/        prepare + commit (signed upload tickets)
  api/jobs/          QStash worker, signature-verified
components/
  auth/              form fields, OTP input, strength meter, threat feed
  dashboard/         shell, sidebar, user menu, logout, stat cards
  ingest/            drag & drop dropzone, ingestion queue
  threat/            finding cards, severity badge + meter
  motion/            reveal, spotlight, count-up, scroll progress, scramble
  marketing/         landing page sections
  ui/                shadcn/ui primitives (Base UI)
lib/
  ai/                OpenAI provider, embeddings, structured threat analysis
  auth/              DAL, Server Actions, audit trail
  ingest/            constants, validation, PII masking, parsing, chunking,
                     the worker, queries, Server Actions
  queue/             QStash publish + signature verification
  rag/               cosine search and the threat probe sweep
  security/          rate limiting, lockout, sanitisation, request helpers
  supabase/          browser / server / proxy / service-role clients
  validations/       Zod schemas and RegEx primitives
proxy.ts             route guard (Next 16 renamed middleware → proxy)
supabase/migrations/ schema, triggers, JWT hook, pgvector, RLS policies
```

---

## Deliberate scope decisions

- **Account deletion is not exposed** in the Super Admin console. Suspension
  covers the "Suspend / Ban" requirement, is reversible, and immediately
  force-logs-out the account by banning its auth record. Irreversible deletion
  needs a confirmation flow and a retention policy, which belong with the
  billing and data-retention work.
- **Team invitations, billing checkout, MFA enrolment, workspace rename, and
  API keys** remain pending. Their routes, role guards, and navigation entries
  are real and enforced; only the feature bodies are marked as such.
- **The ingestion worker uses the service role.** A queue callback has no user
  session, so RLS cannot scope it. Every write is therefore explicitly bound to
  the `workspace_id` read back from the file row, never from the job payload.
- **Legal pages** (`/privacy`, `/terms`) are structural placeholders and say so
  on the page. Replace them with reviewed wording before production.
- **Landing, pricing, and security pages** were added so the auth flows have a
  coherent product around them and no navigation link 404s.

## Phase 3

Remediation playbook execution, Lemon Squeezy billing, team invitations, MFA
enrolment, and streaming SIEM connectors.
