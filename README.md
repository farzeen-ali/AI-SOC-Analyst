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

## Phase 2 security notes
| Control | Where |
| --- | --- |
| Signed upload tickets, server-generated paths | `app/api/ingest/prepare/route.ts` |
| Real object size verification before queueing | `app/api/ingest/commit/route.ts` |
| QStash signature auth on the public worker | `lib/queue/qstash.ts` |
| PII masking | `lib/ingest/pii.ts` |
| Content sniffing, CSV formula injection, prototype pollution, ANSI escapes | `lib/ingest/parse.ts` |
| Bounded events / lines / chunks per file | `lib/ingest/constants.ts` |
| Findings immutable except `status` | `guard_finding_immutable_fields` trigger |

## What Phase 3 delivers

### SOC Intelligence Center (`/dashboard`)
- **Analytics widgets** — total threats detected, an animated critical-risk
  gauge driven by the highest *open* severity, an interactive attack-vector
  breakdown, and a severity distribution bar.
- **Real-time log stream** — Server-Sent Events tail of ingestion and finding
  activity. The connection closes while the tab is hidden or paused, and gives
  up with a Reconnect control on a fatal error rather than retrying forever.
- **Streaming generative UI** — `streamObject` on the server and `useObject` on
  the client share one Zod schema, so partial JSON renders progressively: the
  severity badge appears the moment the verdict lands, then warning alerts,
  then actionable remediation cards.
- **Interactive remediation checklists** — every AI remediation step becomes a
  row that moves through Pending / In Progress / Resolved, applied
  optimistically and rolled back if the server rejects it.

### Role-based rendering
Resolved on the server from the RLS-verified auth context, so a Member's HTML
never contains the restricted markup at all:

| | Tenant Admin | Member | Super Admin |
| --- | --- | --- | --- |
| Log stream + reports | yes | yes | yes |
| Remediation checklist | yes | yes | yes |
| Upgrade panel | yes | **absent** | yes |
| Team invite modal | yes | **absent** | yes |
| Platform banner + admin portal link | no | no | yes |

Hiding a control is presentation only — every route and action re-checks the
role, and seat limits are enforced server-side in `inviteMemberAction`.

### UX polish
- `loading.tsx` skeletons on every dashboard route, sized to the real content
  so the swap is a paint rather than a reflow.
- Suspense boundaries inside `/dashboard` so analytics paint before the slower
  live-stream and remediation queries resolve.
- Page transitions via `template.tsx`, driven by a CSS keyframe rather than a
  JS-gated `initial: { opacity: 0 }` — content can never be stranded invisible
  if the main thread is busy, and `prefers-reduced-motion` disables it.

### Security notes for this phase
- Both new endpoints reject cross-origin requests with **403** before touching
  auth, and unauthenticated requests with **401**.
- The AI route treats *both* the log data and the analyst's question as
  untrusted: they are fenced in the prompt, and the model's output is validated
  against the Zod schema before it reaches the UI. Nothing it returns is ever
  passed to `dangerouslySetInnerHTML`.
- LLM calls have their own tighter rate limit (12 per 5 minutes per workspace
  and IP) because they cost real money.
- The SSE route resolves authorisation **once** through the RLS-scoped context
  before streaming, then filters by the captured workspace id — `cookies()` is
  request-scoped and must not be re-read after the response has begun.


---

## What Phase 4 delivers

### Subscription tiers & Stripe

| | Free | Pro ($20/mo) |
| --- | --- | --- |
| Seats | 1 Tenant Admin + 1 analyst | 1 Tenant Admin + 10 analysts |
| Daily scans | 5 | Unlimited |
| Max upload | 10 MB | 100 MB |
| AI execution | Standard lane | Priority lane |

Hosted Stripe Checkout and the hosted Billing Portal — card details never
touch this application. Entitlement is granted by the signed webhook, never by
the browser returning from checkout, so a user who edits the success URL gets
nothing.

`lib/billing/plans.ts` is the single source of truth: the upload gate, the
seat check, the quota meter and the pricing page all read from it, and the
`seats_for_plan()` trigger in the database enforces the same numbers.

### Webhook hardening

- HMAC verified with `STRIPE_WEBHOOK_SECRET` against the **raw** body before a
  single field is read. Stripe's tolerance window also defeats replay of a
  captured request.
- Event ids are claimed in `stripe_events` before the effect is applied, so a
  duplicate delivery is a no-op. A handler that throws releases the claim so
  Stripe's retry can apply it.
- The route is excluded from the proxy matcher: Stripe has no session cookie,
  and nothing may touch the request before the raw body is read.

### Atomic metering

Daily scans are claimed with an `INCR` / `DECR` pair inside a Redis `EVAL`
script. Redis runs the script atomically, so the increment *is* the claim —
two analysts uploading simultaneously cannot both take the last scan. A
`GET` followed by a conditional `SET` would leave exactly that window.

Without Upstash the gate degrades to `consume_scan_quota()`, a single
`insert … on conflict do update … where scans < limit` statement. Same
guarantee, one round trip, just slower. Exceeding the quota returns **402**
with `code: "quota_exceeded"`, which is what opens the upgrade modal — a 429
would mean "slow down", and the distinction drives different UI.

### Tokenized team invitations

32 random bytes, stored only as a SHA-256 hash, valid 72 hours, single use,
revocable. The invited address is bound into the row and is never read from
the submitted form, so a leaked link can only ever create the one account it
was issued for. `/join/<token>` is a public registration page; acceptance
re-checks expiry, revocation and the current seat limit before creating
anything.

### Super Admin portal

Active subscriptions, scans and token consumption per day, a 14-day usage
chart, and per-tenant plan, seat and scan totals alongside the existing
suspend/reactivate controls.

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
| `0005_remediation_checklists.sql` | Per-step remediation triage, the materialising trigger, and `workspace_threat_analytics()` |
| `0006_mfa_claims.sql` | Adds the `has_mfa` claim to the access-token hook so MFA gating is a pure claim check, plus `debug_my_mfa()` |
| `0007_billing_invites_metering.sql` | Stripe columns on `workspaces`, the plan→seats trigger, the `stripe_events` replay ledger, tokenized `workspace_invitations`, the `usage_daily` rollup, and the atomic `consume_scan_quota()` gate, plus `debug_my_billing()` |
| `0008_drop_unreachable_usage_rpcs.sql` | Drops `platform_usage_series()` and `workspace_usage_totals()`. Both gated on `is_super_admin()`, which resolves `auth.uid()` — NULL for the service-role client their only caller uses, so they could never succeed. The aggregation moved into `lib/admin/queries.ts` |

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

### 4. Point the confirmation email at `/auth/confirm`

**Dashboard → Authentication → Email Templates → Confirm signup.** Replace the
default `{{ .ConfirmationURL }}` link with:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup">
  Confirm your email
</a>
```

This is what fixes the "Unable to sign in" dead end. `{{ .ConfirmationURL }}`
routes through Supabase's verify endpoint and comes back as a PKCE `?code=`,
which can only be exchanged in the *same browser* that signed up — so opening
the email on a phone produced an error even though the address was confirmed.
`{{ .TokenHash }}` is stateless and verifies anywhere.

Both paths are handled either way: `/auth/callback` now treats a failed code
exchange as "confirmed, please sign in" rather than an error, because Supabase
has already verified the address by the time it redirects.

### 5. Enable MFA

Two factor types are supported, and **you only need one of them**.

**Authenticator app (TOTP) — recommended, works on every plan.**
**Dashboard → Authentication → Multi-Factor**, switch **TOTP (App Authenticator)**
to Enabled. Nothing else is required. Users scan a QR code from
**Profile & Security** and confirm with a 6-digit code.

**WebAuthn (optional).** **Dashboard → Authentication → Passkeys**, marked BETA
in the sidebar. Note the naming: the dashboard calls this surface **Passkeys**,
while the API calls the factor type **WebAuthn** (`mfa.webauthn.register()`) —
same credential standard, different label. The **Multi-Factor** page is a
*different* page and lists only TOTP and SMS, so enabling things there will not
clear a `MFA enroll is disabled for WebAuthn` error. If the Passkeys feature is
unavailable or misbehaving on your project, the enrolment UI says so and TOTP
covers the same requirement — nothing else in the system cares which factor
type satisfied the challenge.

While you are on the Multi-Factor page, **Limit duration of AAL1 sessions**
(Enhanced MFA Security) is worth leaving ON. It terminates a session that has
not satisfied its second factor within 15 minutes, which complements the route
guard: the guard stops an `aal1` session *reaching* protected routes, and this
stops it lingering at all.

Users enrol from **Profile & Security**. Once a verified factor exists, the
`has_mfa` claim flips on and the route guard holds every protected route at
`/mfa` until the session reaches `aal2`.

> Enrolment writes a new factor but the *current* token still says
> `has_mfa: false` until it refreshes. Sign out and back in after enrolling to
> see the step-up flow.

### 6. Switch the recovery email to a 6-digit code

**Dashboard → Authentication → Email Templates → Reset Password**. Replace the
magic-link body with the token variable so the OTP screen has a code to verify:

```html
<h2>Reset your GuardAI password</h2>
<p>Your verification code is:</p>
<p style="font-size:28px;letter-spacing:6px;font-weight:700">{{ .Token }}</p>
<p>This code expires in 10 minutes. If you did not request it, ignore this email.</p>
```

### 7. Configure Google OAuth (optional)

**Dashboard → Authentication → Providers → Google.** Add
`https://<your-project-ref>.supabase.co/auth/v1/callback` as an authorised
redirect URI in the Google Cloud console, and add
`{NEXT_PUBLIC_SITE_URL}/auth/callback` to Supabase's **Redirect URLs**.

### 8. Create the first Super Admin

Sign up normally, then promote the account in the SQL Editor:

```sql
update public.profiles
   set global_role = 'super_admin'
 where email = 'you@example.com';
```

Sign out and back in so a new token is minted with the updated claim.

### 9. Set up Stripe (test mode)

Billing runs entirely in Stripe's **test mode** — no real money moves, and the
card `4242 4242 4242 4242` is accepted with any future expiry and any CVC.

**9a. Create the Pro product and price**

Dashboard → make sure the **Test mode** toggle (top right) is ON, then
**Product catalogue → + Add product**:

| Field | Value |
| --- | --- |
| Name | `GuardAI Pro` |
| Pricing model | Recurring |
| Price | `20.00` USD |
| Billing period | Monthly |

Save, then copy the **price id** — it looks like `price_1Ab2Cd...`, *not* the
product id (`prod_…`). That distinction matters: checkout fails with "No such
price" if you paste the product id.

**9b. Copy your API key**

Dashboard → **Developers → API keys** → reveal the **Secret key** (`sk_test_…`).

**9c. Install the Stripe CLI and forward webhooks**

The webhook is what actually grants Pro, so it has to reach your machine. In
local development Stripe cannot call `localhost` directly — the CLI opens the
tunnel for you.

```bash
winget install Stripe.StripeCli
```

Then log in and start forwarding, leaving this running in its own terminal:

```bash
stripe login
```

```bash
stripe listen --events checkout.session.completed,customer.subscription.updated,customer.subscription.deleted --forward-to localhost:3000/api/stripe/webhook
```

The event list is required. Stripe now has two event families — classic
*snapshot* events and v2 *thin* events — so CLI v1.52+ refuses to guess and
errors with *"must specify events to forward using --events, --all-snapshot,
or --all-thin"*. Naming the three events explicitly also keeps the terminal
quiet and mirrors exactly what you subscribe to on a deployed endpoint.
(`--all-snapshot` works too, but forwards everything.)

It prints a line like `Ready! Your webhook signing secret is whsec_...`. That
secret is per-session — if you restart `stripe listen`, copy the new one.

**9d. Fill in `.env.local`**

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_PRICE_ID=price_...
```

Restart `npm run dev` afterwards — these are read at startup.

**9e. Try it**

1. Sign in as a Tenant Admin and open **/dashboard/billing**.
2. Click **Upgrade to Pro**.
3. Pay with `4242 4242 4242 4242`, any future expiry, any CVC, any postcode.
4. Watch the `stripe listen` terminal: you should see
   `checkout.session.completed [200]`.
5. Reload the billing page — the plan reads **Pro**, seats become 11, and the
   daily scan meter switches to unlimited.

You can also fire events without paying:

```bash
stripe trigger customer.subscription.deleted
```

**For a deployed environment** (no CLI): Dashboard → **Developers → Webhooks →
Add endpoint**, URL `https://your-domain.com/api/stripe/webhook`, and select
`checkout.session.completed`, `customer.subscription.updated` and
`customer.subscription.deleted`. Copy that endpoint's signing secret into
`STRIPE_WEBHOOK_SECRET`.

**Troubleshooting**

| Symptom | Cause |
| --- | --- |
| `503 Stripe is not configured` | One of the three variables is missing; the app requires all three together |
| `400 Invalid signature` | `STRIPE_WEBHOOK_SECRET` does not match the listener that sent the event |
| `must specify events to forward using --events...` | CLI v1.52+ requires the `--events` list shown above |
| Webhook never fires for one event type | It was left out of the `--events` list; all three are needed |
| `500 Event ledger unavailable` | Migration `0007` has not been applied — `public.stripe_events` is missing |
| Paid, but the plan still says Free | The webhook never arrived. Check the `stripe listen` terminal; entitlement comes from the webhook, never from the success redirect |
| `Could not open the billing portal` | Save the portal settings once at **Settings → Billing → Customer portal** in test mode |

### 10. Start

```bash
npm run dev
```

With billing enabled you want two terminals:

```bash
stripe listen --events checkout.session.completed,customer.subscription.updated,customer.subscription.deleted --forward-to localhost:3000/api/stripe/webhook
```

---

## End-to-end tests

Playwright drives a **production build** against the real Supabase project.

```bash
npm run test:e2e
```

```bash
npm run test:e2e:report
```

The first command builds, starts a server on port 3100, seeds disposable test
tenants, and runs 65 specs. The second opens the HTML report.

### What it covers

| Spec | Covers |
| --- | --- |
| `01-marketing` | Landing hero, $20 pricing, legal pages, 404, theme toggle, mobile overflow, robots/sitemap, JSON-LD, `noindex` on invitations |
| `02-auth` | Sign-in, bad-password handling and account-enumeration wording, signup validation, password strength, 11 protected routes redirecting, `no-store` on protected responses |
| `03-dashboard` | Overview, threats, ingestion, settings, MFA enrolment, zero console errors, and RBAC for all three roles |
| `04-billing-team` | Plan and seat display, scan meter, plan comparison, checkout entry points, team roster, tokenized invitations, seat enforcement |
| `05-security` | Security headers and CSP, four Stripe webhook forgery attempts, unauthenticated and cross-origin API refusal, tenant isolation, sign-out and back-button |

### Screenshots

Every step writes a numbered, full-page capture to
`test-results/screenshots/<spec>/<test>/NN-step.png`, and each one is attached
to the HTML report.

Captures scroll the page first. Sections wrapped in `<Reveal>` start at
`opacity: 0` and animate in on intersection, and a full-page screenshot does
not scroll — without that pass the images show empty bands where content
exists. Worth knowing when writing assertions: **Playwright treats an
`opacity: 0` element as visible**, so `toBeVisible()` will not catch this
class of bug. Only the screenshot does.

### Test tenants

`e2e/auth.setup.ts` provisions one workspace with a Tenant Admin, a SOC
Analyst and a Super Admin through the Supabase Admin API, then signs each in
through the real form and saves a storage state. Accounts use
`@guardai-e2e.test` addresses and per-run generated passwords, written to the
gitignored `test-results/.auth/`. Delete that folder to force a fresh tenant.

Seeding needs `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL` in
`.env.local`, and migrations `0001`–`0008` applied.

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

## What is next

Lemon Squeezy billing and checkout, MFA enrolment, workspace rename and scoped
API keys, and streaming SIEM connectors.
