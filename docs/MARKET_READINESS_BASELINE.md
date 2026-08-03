# Market Readiness Baseline

**Phase:** 0 — forensic audit, no implementation.
**Verified against:** `main` @ `00a3fc229d6e789ebd355c464a00b2cb041f65f5` (merge of PR #31, "Storage: add StorageProvider abstraction + compile-safe R2 placeholder").
**Method:** direct repository reads, live CI run inspection via the GitHub API, and — where noted — commands actually executed in this workspace. Every material claim below cites a file, line, or an observed command result. Nothing here is copied from prior audit documents without re-verification against current code; contradictions with prior documents are called out explicitly in §8.

---

## 1. What this repository actually is today

One Next.js 16 / React 19 / Prisma 7 / PostgreSQL application hosting **two unrelated products**, bolted together, sharing only a database and a single admin session mechanism:

1. **Legacy product — "Reel Makeover"**: a customer-facing, pay-per-video editing service. Customer uploads a raw Reel or pastes a link, pays ₹500 via UPI, an admin edits and delivers the finished file.
2. **Primary launch candidate — Instagram comment-automation engine**: an admin-operated system that listens to Instagram comment webhooks, matches configured keywords, sends a private DM, then a public reply. Entirely internal — reachable only through the passcode-gated `/ops` console, with no customer-facing product surface at all.

The public landing page (`app/page.tsx`) is written entirely for product (1). Its hero copy reads: *"We professionally remake your Instagram Reels... Send your Reel or raw video. We edit, pace, and polish it."* (`app/page.tsx:29-34`). Root metadata matches: `title: "reels-engine — Professional Reel Makeovers"` (`app/layout.tsx:16`). Product (2) is not described anywhere a customer can read — it is reachable only via three landing-page buttons labeled "Keywords" / "Automation" / "Monitoring," each of which is a live link straight into the admin console (`href="/ops/campaigns"`, `/ops/social-accounts`, `/ops/monitoring`, `detail="Admin sign-in"` — `app/page.tsx:46-49`), each of which redirects an anonymous visitor to `/ops/login` (`app/ops/(protected)/layout.tsx:10-12`). A real customer today cannot use the automation product at all; they can only be told to sign in as an admin, which they aren't.

---

## 2. What genuinely works (evidence, not assumption)

### 2.1 Legacy Reel Makeover — fully functional end-to-end
- Upload (file or link) → `POST /api/projects` → `Project`+`Upload` created (`app/api/projects/route.ts`).
- Manual UPI payment: QR generation (`lib/modules/payments/upi.ts`), UTR submission (`app/api/projects/[id]/payments/route.ts`), admin verification queue (`/ops/payments`).
- Admin fulfillment: `/ops/projects/[id]` — status advance, processed-file upload.
- Customer delivery: `/status/[token]` page, download via `/api/deliver/[token]/[uploadId]`.
- This flow was Playwright-verified end-to-end earlier in this engagement (real file upload, real link paste, real payment page, real status page — all returned correct data, zero console/network errors).

### 2.2 Instagram Automation Engine — the pipeline itself works
- Webhook signature verification (`services/webhook-handler.ts:61-74`), idempotent persistence via a DB unique constraint on `commentId` (`ConversionLog.commentId @unique`, `prisma/schema.prisma:246-248`), trigger matching (`services/trigger-matcher.ts`), private DM send (`services/private-reply.ts`), public reply send (`services/public-reply.ts`), finalization (`services/conversion-finalizer.ts`), orchestrated by `services/pipeline-orchestrator.ts`, dispatched via Next.js `after()` from `app/api/webhooks/instagram/route.ts:88-100`.
- Verified this session via real HMAC-SHA256-signed webhook POSTs against the live route (not a unit test): a comment containing an active keyword correctly reached `matchedKeyword` and routed to the right campaign; disabling that keyword via the Keyword Management UI immediately stopped it from matching on the next identical comment; a keyword bulk-added after campaign creation matched on the very next comment. This is real, working logic, not scaffolding.
- Admin console pages are real, not placeholders: Dashboard (`/ops/dashboard`), Campaigns (`/ops/campaigns`, `+new`, `+[id]`), Keyword Management (nested in campaign edit — bulk add, inline edit, enable/disable, delete, search/filter, all backed by real API routes under `/api/admin/campaigns/[id]/keywords`), Social Accounts / OAuth connection (`/ops/social-accounts`), Monitoring (`/ops/monitoring` — Recent Webhook Events, Automation Activity, System Status, Error Monitoring, Search & Filter). All confirmed via direct code reads and, for the landing-page connections, live Playwright clicks with network-request capture.

### 2.3 CI/CD is real and green
- `.github/workflows/ci.yml`: on every PR, runs `npm ci` → `prisma generate` → `next typegen` → `typecheck` → `lint` → `prisma migrate deploy` against a real `postgres:16` service container → `build` → `npm test --if-present` → `npm audit --audit-level=critical` (hard gate) → `npm audit --audit-level=high` (informational).
- The "Unit tests" step comment still reads *"No test suite yet"* (`ci.yml:82-84`) — stale text; `package.json` now has a real `"test"` script (§4 below) and the step **does** execute it. Verified via the GitHub Actions API: run `30788031990` on `claude/storage-r2-migration` (the branch that added the tests) completed with `conclusion: success` on 2026-08-03.
- `.github/workflows/codeql.yml` runs on push to `main`, every PR, and weekly (Monday 03:00 UTC).

### 2.4 Security hygiene is generally sound
- AES-256-GCM encryption of `SocialAccount.pageAccessToken` (`lib/crypto.ts`), correct IV/auth-tag handling, required 32-byte key.
- `timingSafeEqual` used correctly for: webhook signature verification, Meta `signed_request` verification, admin passcode comparison, admin session signature. AES-GCM decrypt failures are caught and routed to `FAILED` status rather than crashing.
- Repo-wide grep confirms zero `dangerouslySetInnerHTML`, `eval(`, `$queryRaw`/`$executeRaw`, `TODO`/`FIXME` outside documentation prose, and no `console.*` outside the sanctioned `lib/logger.ts` wrapper.
- Storage abstraction (`lib/modules/storage/`) is a clean interface (`StorageProvider`) with path-traversal protection in `LocalStorageProvider.resolvePath()` and a **compile-safe R2 placeholder** that throws a clear, loud error on every call rather than silently misbehaving — a deliberately safe failure mode, confirmed by dedicated tests (`lib/modules/storage/__tests__/r2-storage-provider.test.ts`).

---

## 3. What remains single-owner or internal-only

This is the central fact of the current codebase and the reason MR-4/MR-5 exist:

- **No multi-tenancy of any kind.** A repo-wide grep for `tenant|workspace|ownerId|userId|organizationId` (case-insensitive) across `prisma/schema.prisma` returns **zero matches**. None of the 9 Prisma models (`Project, Payment, Upload, Revision, SocialAccount, Campaign, Keyword, Lead, ConversionLog`) has an owner/tenant/user foreign key.
- **No per-user identity anywhere.** Admin auth is one shared `ADMIN_PASSCODE` env var (`.env.example:11`), verified via `timingSafeEqual` (`lib/modules/admin/session.ts:58-67`). The session token is `${expiresAt}.${HMAC-SHA256(expiresAt, ADMIN_SESSION_SECRET)}` (`session.ts:21-28`) — it encodes an expiry and a signature, nothing else. There is no username, no role, no user id, anywhere in the auth system. The module's own doc comment concedes this: *"Minimal passcode-gated admin session, designed to be swapped for real auth + RBAC (Owner/Admin/Editor/Client) later without touching callers"* (`session.ts:16-20`).
- **Every listing query in `/ops` is unscoped.** `campaign.findMany()`, `socialAccount.findMany()`, `lead.findMany()`, and the dashboard/monitoring `conversionLog.findMany()` calls all run with no `where` clause tied to any identity — or with a `where` built only from business filters (status, date, search text), never a tenant scope. Confirmed by direct reads of `app/ops/(protected)/campaigns/page.tsx:6-9`, `social-accounts/page.tsx:25-28`, `dashboard/page.tsx:10-65`, `monitoring/page.tsx:41-74`. If two customers existed today, each would see 100% of the other's campaigns, leads, and conversation history.
- **The customer-facing automation product does not exist.** Nothing lets a real customer sign up, connect their own Instagram account, or configure their own campaign. The only entry point is the admin console.
- **No billing/subscription system.** Razorpay integration (`lib/modules/payments/razorpay.ts`) is fully implemented but explicitly unwired — both its route files self-document as *"scaffolding only"* (`app/api/payments/razorpay/orders/route.ts:10-12`, `.../webhook/route.ts:8`) and grep confirms no customer-facing page references them. It exists to support the **legacy per-project payment**, not a SaaS plan/subscription model, which does not exist in any form.

---

## 4. Current security and reliability controls — and their known gaps

| Control | State | Evidence |
|---|---|---|
| Duplicate webhook delivery | Protected — DB unique constraint on `commentId` | `prisma/schema.prisma:246-248`; `services/webhook-handler.ts:110-128` catches Prisma `P2002` as a duplicate |
| **Concurrent duplicate-send** (two simultaneous runs of the same pipeline stage) | **Not protected.** Every pipeline stage does status-guard → external call → later `update()`, with no `prisma.$transaction`, no row lock | Confirmed by direct read: `services/private-reply.ts:37-77`, `services/public-reply.ts:40-80` — zero `$transaction` occurrences in either file (grepped). Two concurrent invocations could both pass the guard and both send a DM/reply before either writes back. |
| Retry after transient failure | **Not implemented, despite schema support.** `ConversionLog.retryCount`/`nextRetryAt` exist but `retryCount` is only ever written (`increment: 1` on failure, `private-reply.ts:27`, `public-reply.ts:30`) and read only for display on the Monitoring page (`monitoring/page.tsx:302`); `nextRetryAt` is never read or written by any application code anywhere. A `FAILED` row is permanent. | grep for both fields, full-repo |
| Batch recovery sweep | **Defined, never wired to anything.** `matchPendingConversionLogs`, `sendPendingPrivateReplies`, `sendPendingPublicReplies` all exist and each explicitly documents itself as *"not a queue consumer or scheduler in its own right... for a future Vercel Cron tick... to call"* — no cron config, no queue, no caller exists anywhere in the repo | `services/trigger-matcher.ts:116-135`, `services/private-reply.ts:79-98`, `services/public-reply.ts:82-100`; confirmed no call sites via repo-wide grep |
| Token refresh | **Not implemented.** `refreshLongLivedToken` is fully written but has exactly one reference in the entire repo — its own definition | `lib/modules/meta/instagram-oauth.ts:105`, grep confirms zero other references |
| OAuth CSRF state comparison | **One unfixed timing-safety gap.** The primary `state !== cookieValue` check is a plain string comparison, not constant-time (a `timingSafeEqual` call exists later in the same function, but only on an internal signature sub-component, not on the caller-supplied `state` itself) | `lib/modules/meta/oauth-state.ts:33` |
| Rate limiting | In-memory, single-instance only, and the client-IP key is derived from a client-supplied header with no trusted-proxy validation | `lib/modules/security/rate-limit.ts:1-5,38-42` — no Redis/Upstash dependency anywhere in `package.json` |
| Production file storage | Local disk by default; does not survive a Vercel redeploy/restart. R2 exists only as a safe-failing placeholder — real Cloudflare R2 (SDK, credentials, presigned URLs) is **not implemented** | `docs/STORAGE.md:23-24,30-50`; `lib/modules/storage/r2-storage-provider.ts:11-18` |
| Automated test coverage | 3 test files exist, all scoped to the brand-new storage module only (`lib/modules/storage/__tests__/`). **Zero test coverage** of the webhook pipeline, trigger matching, OAuth, campaigns, keywords, payments, or any API route. No Playwright configuration exists anywhere in the repo despite `playwright` being a devDependency | glob for `*.test.ts`/`*.spec.ts` repo-wide; no `playwright.config.ts`/`vitest.config.ts`/`jest.config.ts` at the repo root |
| Owner Test Mode | Present, real, and gated only by `OWNER_TEST_MODE === "true"` with no additional check — called unconditionally inside the public, unauthenticated `POST /api/projects` handler whenever the flag is on | `lib/modules/testing/owner-test-mode.ts:1-9`; `app/api/projects/route.ts:96-98,126-128` |

---

## 5. Legacy functionality (explicitly not to be broken in Phase 0)

- `Project`, `Payment`, `Upload`, `Revision` models and every route/page built on them (`app/api/projects/**`, `app/pay/[id]`, `app/status/[token]`, `app/upload`, `/ops/projects`, `/ops/payments`, `/ops/reports`).
- `Project.keywordsPackage` / `automationPackage` / `monitoringPackage` boolean fields — explicitly commented *"Future service flags (Phase 2+ features, not implemented in V1)"* (`prisma/schema.prisma:56-59`) and have zero application-code references. Unused, zero risk, not touched.
- `Revision` model — zero application-code references, forward-looking, not touched.
- Razorpay scaffolding (`lib/modules/payments/razorpay.ts` + its two API routes) — fully implemented, unreachable from any UI, left as-is.

---

## 6. Known blockers and technical debt (carried forward, re-verified)

All items below were independently re-confirmed against current `main`, not copied from prior documents:

1. **Concurrent duplicate-send in the automation pipeline** (§4) — no transaction around private-reply/public-reply's check-then-act sequence. **This is new-to-this-audit in severity framing**: prior documentation (`docs/TECHNICAL_DEBT.md`) does not mention it at all, because it predates the Automation Engine's own hardening pass. Confirmed still present.
2. **No retry/recovery path** for `FAILED` conversion log rows (§4).
3. **No token refresh** — a connected Instagram account will silently stop working once its token expires, with only a passive dashboard color-change as the signal (§4).
4. **Zero multi-tenancy** (§3) — the single largest architectural gap relative to the "minimal multi-tenant SaaS beta" launch goal.
5. **No customer-facing automation product surface** (§3) — nothing for the intended primary product's actual customers to use.
6. **Production storage backend not implemented** — `R2StorageProvider` is a placeholder; local disk is the only working provider and does not survive Vercel redeploys (`docs/TECHNICAL_DEBT.md`, re-verified current).
7. **Razorpay unverified end-to-end and unwired from any UI** — not a blocker for manual-UPI-only launch, but must not be switched on untested.
8. **Branch protection on `main`** — `CONTRIBUTING.md:58-71` describes it as a manual step an admin must apply in GitHub Settings; the document does not assert this has actually been done, and no API-based way to verify it exists from this session. **Contradiction flagged**: `CONTRIBUTING.md:49` separately states as fact *"`main` is protected: no direct pushes, PRs only"* — this contradicts the same document's own later section describing it as a still-pending manual action. Unresolved; treat as unconfirmed.
9. **Automated test coverage is minimal and scoped only to the storage module** (§4) — this is the direct subject of MR-1.
10. **Rate limiting is not distributed** and its client-IP key is spoofable (§4) — relevant once real multi-instance/serverless production traffic exists.

---

## 7. Environment configuration — full current surface

`.env.example` (62 lines) declares exactly these variables, grouped by concern: `DATABASE_URL`; `STORAGE_DRIVER`/`STORAGE_ROOT` (storage); `ADMIN_PASSCODE`/`ADMIN_SESSION_SECRET` (admin auth); `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`/`RAZORPAY_WEBHOOK_SECRET` (legacy payment, unwired); `OWNER_TEST_MODE` (QA bypass); `META_APP_SECRET`/`META_WEBHOOK_VERIFY_TOKEN`/`META_GRAPH_API_BASE_URL` (webhook verification + Graph API); `INSTAGRAM_APP_ID`/`INSTAGRAM_APP_SECRET`/`INSTAGRAM_OAUTH_REDIRECT_URI`/`INSTAGRAM_OAUTH_API_BASE_URL` (OAuth); `TOKEN_ENCRYPTION_KEY` (AES-256-GCM); `OAUTH_STATE_SECRET` (CSRF). No R2 credential variables exist (none needed yet — R2 is unimplemented). No multi-tenancy variables exist (no per-tenant config, no `NEXTAUTH_*`, no customer-identity provider). No billing/subscription variables exist beyond the unwired Razorpay keys.

---

## 8. Contradictions found between existing documentation and current implementation

Per the documentation quality gate, these are flagged rather than silently carried forward:

1. **`docs/PRODUCTION_READINESS.md:26-28`** states: *"Per the V1 Freeze Rule: authentication/accounts, RBAC, notifications, analytics, AI, automation, CRM, multi-tenancy, and cloud storage migration are Version 2 concerns and are correctly absent, not gaps."* This directly contradicts the locked product direction for this Phase 0 exercise, which names Instagram automation as the **primary launch product** and multi-tenancy as a **required launch boundary**, not a deferred "V2 concern." This document predates the product pivot and its scope statement is superseded — it should not be read as current guidance. `docs/PRODUCT_BOUNDARY_DECISION.md` (this Phase 0 deliverable) is the authoritative statement going forward.
2. **`docs/HARDENING_REPORT.md`, `docs/SECURITY_REVIEW.md`, `docs/PERFORMANCE_REVIEW.md`, `docs/VALIDATION_CHECKLIST.md`** were all written against the legacy Reel Makeover product only, before the Automation Engine existed in the codebase. None of them assess webhook handling, trigger matching, OAuth, campaigns, keywords, or the pipeline — the system that is now the primary launch candidate has never had a dedicated security/reliability document written for it. (A forensic audit of the automation engine was performed as a chat deliverable earlier in this engagement; its findings are consistent with and corroborated by the fresh evidence gathered for this baseline, but it was never committed to `docs/`.)
3. **`docs/TECHNICAL_DEBT.md`** does not list the concurrent duplicate-send gap (§4, item 1) at all — it predates a systematic look at the pipeline's transaction safety. This baseline is the first document to record it.
4. **`CONTRIBUTING.md`** contains an internal contradiction on branch-protection status (§6, item 8).
5. **`.github/workflows/ci.yml:82-84`**'s comment claims *"No test suite yet"* — stale as of PR #31; a real test script now exists and runs (§2.3, §4).

---

## 9. Evidence index

All claims above trace to: `prisma/schema.prisma` (full read), all 6 migrations under `prisma/migrations/`, `services/*.ts` (all 6 files), `lib/modules/meta/*.ts`, `lib/modules/storage/*.ts` + tests, `lib/modules/security/rate-limit.ts`, `lib/modules/admin/session.ts`, `lib/crypto.ts`, `app/page.tsx`, `app/_components/ServiceButton.tsx`, `app/upload/_components/UploadForm.tsx`, `app/ops/**` (every page and component), `app/api/**` (every route touched by this audit), `.env.example`, `package.json`, `.github/workflows/*.yml`, `.github/dependabot.yml`, `CONTRIBUTING.md`, `docs/*.md` (pre-existing), and one live GitHub Actions API query confirming CI run `30788031990` succeeded on the branch that introduced the test suite.
