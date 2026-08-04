# Market Readiness Master Plan

**Fixed final goal:** launch Reels Engine as a safe, reliable, commercially usable Instagram comment-automation SaaS beta for real customers. Not an endless research or feature-expansion exercise — every milestone below exists to remove a specific, evidence-backed launch blocker recorded in `docs/MARKET_READINESS_BASELINE.md`, within the boundaries locked in `docs/PRODUCT_BOUNDARY_DECISION.md`.

**Fixed milestone order:** MR-1 → MR-2 → MR-3 → MR-4 → MR-5 → MR-6 → MR-7 → MR-8 → MR-9. Order is intentional, not arbitrary: MR-1 gives every later milestone a safety net; MR-2/MR-3 make the existing single-tenant pipeline actually trustworthy before more surface area (tenancy, customer UI, billing) is built on top of it; MR-4/MR-5 turn "one operator's tool" into "a product customers can use"; MR-6/MR-7 make it sellable; MR-8 makes it production-safe at real scale; MR-9 is the only milestone allowed to say GO.

No milestone here has been started. This document is the plan, not a status report.

---

## MR-1: Automated test foundation and Playwright in CI

**Objective:** give every subsequent milestone a real regression safety net. Today, 3 test files exist and all of them test the storage module added in PR #31 — the actual product (webhook ingestion, trigger matching, OAuth, campaigns, keywords, payments) has zero automated coverage (`docs/MARKET_READINESS_BASELINE.md §4`).

**Exact scope:**
- Extend the existing Node-native test runner setup (`node --test` via `tsx`, already wired in `package.json:14` and proven to work in CI) to cover: webhook signature verification, trigger-keyword matching logic, campaign/keyword CRUD API routes, admin session/auth logic, OAuth state generation/validation, and the storage-key path-traversal guard already tested for local storage.
- Add a `playwright.config.ts` and wire a genuine Playwright job into `.github/workflows/ci.yml` covering the golden paths already manually Playwright-verified in this engagement: landing page → upload → pay page; landing page → link paste → status page; admin login → campaign create → keyword add/disable → verify matching changes; the three landing-page buttons' auth-redirect behavior.
- Update `.github/workflows/ci.yml`'s stale "No test suite yet" comment (`ci.yml:82-84`) to reflect reality.

**Explicit exclusions:** no new product features. No changes to trigger-matching semantics, pipeline behavior, or any schema. No load/performance testing (that's MR-9). No visual regression testing.

**Expected files/system areas:** new `*.test.ts` files under `services/__tests__/`, `lib/modules/**/__tests__/`, `app/api/**/__tests__/`; new `playwright.config.ts` and `e2e/` (or similar) directory; `.github/workflows/ci.yml` edits (new Playwright job, corrected comment); `package.json` script additions if a distinct `test:e2e` script is warranted.

**Schema/API/security impact:** none. Test-only.

**Dependencies:** none — this can start immediately on current `main`.

**Risks:** CI run time increases (Playwright browser install + run); mitigate by keeping the Playwright suite to the golden paths, not exhaustive coverage. Risk of flaky tests against real Postgres/webhook timing (the pipeline uses `after()` for async dispatch) — tests must poll/wait deterministically, not sleep-and-hope.

**Acceptance criteria:** `npm test` covers every service file's core happy-path and at least one failure path; Playwright suite covers the golden paths listed above; both run in CI on every PR and are required (not `--if-present` no-ops).

**Automated verification:** CI green on a PR that intentionally breaks one covered behavior (proves the test actually catches it), then green again once reverted.

**Manual verification:** review test file list against the "Exact scope" bullet list above — nothing claimed as covered that isn't actually asserted.

**Rollback strategy:** revert the PR; zero runtime impact since this is test-only.

**Definition of completion:** CI has two required, non-skippable, currently-green jobs (unit/integration + Playwright) exercising the areas listed above, and this is verifiable by reading `.github/workflows/ci.yml` and the CI run history — not by narrative claim.

---

## MR-2: Concurrent idempotency and duplicate-send protection

**Objective:** close the confirmed gap where two concurrent executions of `sendPrivateReply`/`sendPublicReply` could both pass their status guard and both send a duplicate DM/public reply before either writes back (`docs/MARKET_READINESS_BASELINE.md §4`, confirmed zero `$transaction` usage in `services/private-reply.ts` and `services/public-reply.ts`). This is a Critical-severity gap for a commercial product — duplicate outbound messages to real customers' real followers is a trust and Meta-policy risk, not a cosmetic bug.

**Exact scope:**
- Wrap each pipeline stage's status-guard → external-call → status-update sequence in a mechanism that makes concurrent execution safe: either a `prisma.$transaction` with a row-level lock acquired before the guard check (e.g. `SELECT ... FOR UPDATE` via `$queryRaw` on the specific row, given Prisma's client API doesn't expose row locks directly) or an atomic conditional update (`UPDATE ... WHERE id = ? AND status = ? RETURNING *` pattern) that only proceeds if the row was actually still in the expected state, with the external call gated on that atomic claim succeeding.
- Apply the same pattern to `services/trigger-matcher.ts` and `services/conversion-finalizer.ts` for consistency, even though their current risk is lower (no external side effect), so the whole pipeline has one, single, understood idempotency pattern.
- Add a regression test (MR-1 infrastructure) that fires two concurrent calls to `sendPrivateReply` for the same row and asserts exactly one Meta call is made.

**Explicit exclusions:** no queue/worker infrastructure (that's a MR-3/MR-8 concern if needed at all). No change to the matching logic itself. No change to `services/pipeline-orchestrator.ts`'s sequential stage order.

**Expected files/system areas:** `services/trigger-matcher.ts`, `services/private-reply.ts`, `services/public-reply.ts`, `services/conversion-finalizer.ts`. No schema change required — the existing `ConversionLog.status` field is sufficient as the lock/claim field if the atomic-update pattern is used.

**Schema/API/security impact:** none to schema (unless the atomic-update pattern proves insufficient and a `lockedAt`/version column is genuinely required — if so, that must be justified in the PR, per the engineering rule against unnecessary schema changes carried over from prior milestones). No API surface change.

**Dependencies:** MR-1 (needs the test infrastructure to prove the fix).

**Risks:** getting the atomic-update pattern wrong could introduce a different bug (e.g. a row that's claimed but the external call fails without a proper failure-path unclaim) — this is exactly why a concurrent-execution regression test is part of the scope, not optional.

**Acceptance criteria:** two concurrent invocations of any pipeline stage against the same row result in exactly one external side effect and one consistent final status; verified by the new test, not by inspection alone.

**Automated verification:** the new concurrent-execution test in CI, plus re-running the existing manual signed-webhook verification method (already proven in this engagement) with a deliberately duplicated webhook delivery.

**Manual verification:** code review confirming no remaining check-then-act gap in any of the four files touched.

**Rollback strategy:** revert the PR; the prior (unsafe but functional) behavior returns. No data migration involved, so rollback is a plain code revert.

**Definition of completion:** the concurrent-execution test passes in CI; grep for `$transaction` (or the chosen atomic-update helper) across all four pipeline service files shows the pattern applied to every check-then-act sequence.

---

## MR-3: Retry, recovery, token refresh, and disconnected-account enforcement

**Objective:** close four related, confirmed gaps: (1) `FAILED` rows are permanently stuck — `retryCount` is written but never consumed, `nextRetryAt` is never read or written at all; (2) the batch recovery functions (`matchPendingConversionLogs`, `sendPendingPrivateReplies`, `sendPendingPublicReplies`) are fully written but never called from anywhere; (3) `refreshLongLivedToken` exists but is never called, so a connected account's token silently expires; (4) there is no enforcement anywhere that stops the pipeline from attempting to act on a `DISCONNECTED`/`TOKEN_EXPIRED` `SocialAccount`.

**Exact scope:**
- Wire a scheduled entry point (Vercel Cron, per the code's own long-standing comments anticipating exactly this — `services/trigger-matcher.ts:120`) that calls the three existing batch functions on an interval, so `PENDING` rows and (once retry logic exists) eligible `FAILED` rows actually get processed without a human intervening.
- Implement bounded retry: on failure, set `nextRetryAt` (already exists, currently dead) using a backoff strategy, and change the batch/recovery path to pick up rows whose `nextRetryAt` has passed, up to a defined maximum `retryCount` before a row is marked permanently failed (a genuinely terminal state, not silently retried forever).
- Wire `refreshLongLivedToken` into a scheduled check (same cron entry point, or a separate one) that refreshes tokens before `tokenExpiresAt`, and updates `SocialAccountStatus` to `TOKEN_EXPIRED` when a refresh fails or a token is confirmed expired.
- Add an explicit guard in `private-reply.ts`/`public-reply.ts` (or upstream in the orchestrator) that refuses to attempt a send against a `SocialAccount` that is not `ACTIVE`, and marks the affected `ConversionLog` accordingly rather than attempting and failing.

**Explicit exclusions:** no new queue/worker service beyond Vercel Cron. No customer-facing retry configuration (retry policy is a fixed, internal constant for the beta). No change to the DM/public-reply message content logic.

**Expected files/system areas:** `services/trigger-matcher.ts`, `services/private-reply.ts`, `services/public-reply.ts`, `lib/modules/meta/instagram-oauth.ts` (wiring `refreshLongLivedToken`'s caller), a new Vercel Cron route (e.g. `app/api/cron/*`) or equivalent scheduled trigger, `vercel.json` (does not currently exist — its absence is itself evidence there is no cron configured today).

**Schema/API/security impact:** none required to schema — `retryCount`/`nextRetryAt` already exist and just need to be actually used. New cron route(s) must be protected against unauthenticated invocation (Vercel Cron's own auth header verification, or a shared secret) — this is a genuine new security surface and must be reviewed as such.

**Dependencies:** MR-1 (tests), MR-2 (retry re-attempts must be safe under the same concurrency guarantees MR-2 establishes — retrying a row that could double-send is strictly worse than not retrying at all).

**Risks:** a badly-tuned retry policy could hammer Meta's API and trigger rate limiting or account flags — backoff must be conservative and bounded. Cron-triggered runs must not overlap/race with the `after()`-triggered inline pipeline run for the same row (MR-2's row-claim mechanism must cover both call paths).

**Acceptance criteria:** a `ConversionLog` row that fails transiently (simulated) is automatically retried within its backoff window and reaches a terminal state without human intervention; a `SocialAccount` with an expired token is automatically detected and marked `TOKEN_EXPIRED` before it causes repeated failed sends; no pipeline stage ever attempts a send against a non-`ACTIVE` account.

**Automated verification:** new tests (MR-1 infra) simulating a transient failure and asserting eventual recovery; a test asserting a `DISCONNECTED`/`TOKEN_EXPIRED` account's campaigns are skipped, not attempted-and-failed.

**Manual verification:** trigger a real transient failure against a real (sandboxed) Meta test setup and observe recovery without manual intervention; manually expire a test token and confirm the system detects and reflects it without sending further attempts.

**Rollback strategy:** disable the cron trigger (disable or delete `.github/workflows/automation-cron.yml`) to fall back to the current at-most-once, manual-recovery-only behavior; no data loss since retry state lives in existing columns.

**Definition of completion:** cron-triggered recovery is live and observable in Monitoring (a `FAILED` row that later succeeds via retry is visible in the existing Automation Activity view); token refresh runs on a schedule and is verifiable via `SocialAccount.tokenExpiresAt` advancing without manual OAuth re-connection.

---

## MR-4: User, workspace, and tenant authorization

> **Beta SaaS Build Program addendum:** Product Owner decision re-sequenced this milestone's scope into finer-grained sub-milestones (MR-3.1 Customer Authentication, MR-3.2 Single Organization Model, MR-3.3 Customer Dashboard, MR-3.4 Subscription System, MR-3.5 Onboarding, MR-3.6 Launch Polish — roughly covering what this section and MR-5/MR-7 describe below, at smaller-PR granularity, one milestone approved and merged at a time). MR-3.1 (customer sign-up/login/session management, `lib/auth/server.ts`) is complete; see `docs/MARKET_READINESS_CHECKLIST.md`'s Authentication section for evidence. The objective/scope below remains the accurate description of the full body of work — treat "MR-4" as the umbrella this addendum's sub-milestones incrementally deliver, not a stale/superseded plan.

**Objective:** replace the single-shared-passcode, zero-tenancy model (`docs/MARKET_READINESS_BASELINE.md §3`) with real per-user authentication and workspace-scoped data isolation — the single largest structural gap standing between "internal tool" and "SaaS product," per `docs/PRODUCT_BOUNDARY_DECISION.md §3-4`.

**Exact scope:**
- Introduce `User` and `Workspace` models (new Prisma models — this is the one milestone in this plan expected to require schema changes, and they are justified here: no smaller change can introduce real tenancy).
- Add a `workspaceId` (or equivalent) foreign key to every model that should be tenant-scoped: `SocialAccount`, `Campaign` (and transitively `Keyword`, `ConversionLog` via `Campaign`), `Lead`. Decide and document whether `Lead` is workspace-scoped directly or only via its `ConversionLog` relations (currently `Lead.instagramUserId` is globally unique across all campaigns — this assumption must be revisited under multi-tenancy, since the same Instagram user could plausibly interact with two different customers' campaigns).
- Real authentication (a decision on provider — e.g. NextAuth/Auth.js, or a custom email+password/magic-link flow — is an implementation-time decision for this milestone, not fixed here) replacing the single `ADMIN_PASSCODE` for workspace owners.
- Introduce a genuine internal super-admin role, distinct from workspace-owner auth, that can see across workspaces for support purposes (replacing today's conflated single admin passcode).
- Re-scope every existing `/ops` query identified as unscoped in the baseline (`campaigns/page.tsx`, `social-accounts/page.tsx`, `dashboard/page.tsx`, `monitoring/page.tsx`, and their siblings) to filter by the authenticated workspace, for workspace-owner sessions, while super-admin sessions retain cross-workspace visibility.

**Explicit exclusions:** no team seats / multiple users per workspace (per `docs/PRODUCT_BOUNDARY_DECISION.md §3` — one workspace owner per workspace for the beta). No SSO. No fine-grained permissions beyond "workspace owner" and "internal super-admin."

**Expected files/system areas:** `prisma/schema.prisma` (new models + FKs, new migration), every `/ops` page and API route currently reading unscoped data (per the baseline's full list), `lib/modules/admin/session.ts` (replaced/extended), new auth routes, `app/ops/(protected)/layout.tsx` (auth check replaced).

**Schema/API/security impact:** significant and expected — this is the one milestone authorized to make substantial schema changes. Every API route touching `Campaign`/`SocialAccount`/`Keyword`/`ConversionLog`/`Lead` needs a security review to confirm it enforces workspace scoping, not just that it compiles. This is the single highest-risk milestone in the plan for introducing a cross-tenant data leak if done carelessly, and must be reviewed accordingly.

**Dependencies:** MR-1 (tests, especially tenant-isolation tests), MR-2/MR-3 (a stable, safe single-tenant pipeline is a much smaller thing to re-scope than an unstable one).

**Risks:** the largest risk in this entire plan. A missed `where` clause anywhere leaks one customer's Instagram DMs/leads/campaign data to another. Migration of any existing legacy/test data into the new workspace model needs a clear, tested plan — not an afterthought.

**Acceptance criteria:** every tenant-scoped model has a required workspace foreign key; every query against those models is provably scoped (grep-verifiable, and covered by an automated cross-tenant-isolation test per model); a workspace owner authenticated as Workspace A cannot read, list, or mutate any Workspace B resource via any route, verified by an explicit negative test per resource type.

**Automated verification:** a dedicated tenant-isolation test suite (MR-1 infra) that creates two workspaces with data and asserts zero leakage across every scoped model and every route.

**Manual verification:** manual attempt to access Workspace B's campaign/social-account/monitoring data while authenticated as Workspace A, via direct URL manipulation, confirming a 403/404, not data.

**Rollback strategy:** this milestone is not safely revertible once real customer workspaces exist on top of it — it must be fully verified in staging before any production data depends on it. Rollback plan is "do not deploy to production until MR-9's staging verification passes," not "revert after the fact."

**Definition of completion:** two real (staging) workspaces, created independently, each with a connected test Instagram account and campaigns, provably cannot see each other's data anywhere in the product — admin console or (once MR-5 exists) customer workspace UI.

---

## MR-5: Customer onboarding and customer workspace

**Objective:** give a real customer, for the first time, a way to sign up and use the automation product themselves — today this literally does not exist (`docs/MARKET_READINESS_BASELINE.md §3`, `§1`).

**Exact scope:**
- Signup/login flow for a workspace owner (built on MR-4's auth).
- A customer-facing workspace UI: connect Instagram (reusing the existing, working OAuth flow, `lib/modules/meta/instagram-oauth.ts`), create/edit campaigns and keywords (reusing the existing, working Campaign/Keyword Management UI logic, re-skinned and re-scoped for customer use rather than admin use), and view their own automation activity (a customer-scoped adaptation of the existing Monitoring/Dashboard views).
- A minimal onboarding sequence: signup → connect Instagram → create first campaign → see it live. Every step must work with a real Instagram test account, not a mock.

**Explicit exclusions:** no team invites (MR-4 boundary). No customer-configurable retry/rate-limit policy. No customization of the admin-facing Monitoring feature set beyond what's needed to scope it per-workspace — this is reuse, not a new build.

**Expected files/system areas:** new `app/(customer)/**` (or similar) route group, reusing existing service-layer logic (`services/*.ts` untouched by this milestone), new signup/onboarding pages, adaptation (not rebuild) of `KeywordManagement.tsx`/campaign pages/monitoring views for customer scope.

**Schema/API/security impact:** API routes need workspace-scoped variants (or the existing `/api/admin/*` routes need to become workspace-aware and split into admin vs. customer-facing paths with distinct authorization checks) — this is primarily an authorization-layer change built on MR-4, not a new data model.

**Dependencies:** MR-4 (hard dependency — customer workspaces require tenancy to exist first).

**Risks:** UI reuse from the admin console must not accidentally expose admin-only actions (e.g. cross-workspace visibility, account disconnection semantics that assume operator trust) to customer sessions — every reused component needs an explicit authorization review, not just a route-level gate.

**Acceptance criteria:** a brand-new user can sign up, connect a real Instagram test account, create a campaign with keywords, and see a live comment trigger a DM in their own workspace view — end to end, with zero admin intervention.

**Automated verification:** Playwright (MR-1 infra) golden-path test: signup → connect → campaign create → (simulated webhook) → activity visible.

**Manual verification:** a real walkthrough against a real Meta-approved test Instagram Business account, not a mock — this is also the first rehearsal for MR-9's Meta sandbox requirement.

**Rollback strategy:** the customer-facing route group can be feature-flagged off, falling back to admin-only operation via `/ops` while remaining fully functional, since this milestone reuses rather than replaces the underlying service layer.

**Definition of completion:** the onboarding golden-path Playwright test passes, and a real manual walkthrough with a real Instagram test account is documented with evidence (screenshots, webhook logs) in the milestone's completion record.

---

## MR-6: Public positioning, marketing, legal pages, and trust

**Objective:** fix the confirmed positioning mismatch — the public landing page currently sells the legacy Reel Makeover product exclusively (`app/page.tsx:29-34`, `app/layout.tsx:16`) while the primary launch product has no public description at all — and add the legal/trust surface a real SaaS needs (`docs/MARKET_READINESS_BASELINE.md §3` notes zero privacy/terms pages exist).

**Exact scope:**
- Rewrite the public landing page to describe and sell the Instagram automation product as the primary offering. Per `docs/PRODUCT_BOUNDARY_DECISION.md §2`, the legacy Reel Makeover product's public presence is de-emphasized/relocated, not deleted.
- Add Privacy Policy, Terms of Service, and a genuinely functioning data-deletion/export flow (the Meta-mandated data-deletion webhook route already exists at the infrastructure level per this engagement's earlier audit — this milestone makes it a real, customer-visible, documented process, not just a technical callback).
- Add `robots.txt`/`app/sitemap.ts` (confirmed absent today), correct `<title>`/metadata per page, and basic OpenGraph tags.
- No unsupported claims: any statement about security, Meta approval status, or reliability on marketing pages must trace to something actually true and verified elsewhere in this plan (per the Locked Product Direction's explicit rule) — this milestone must not get ahead of what MR-1 through MR-5 have actually proven.

**Explicit exclusions:** no paid marketing/SEO campaign work. No blog/content platform. No multi-language support.

**Expected files/system areas:** `app/page.tsx` (rewrite), `app/layout.tsx` (metadata), new `app/privacy/page.tsx`, `app/terms/page.tsx`, `app/robots.ts`, `app/sitemap.ts`.

**Schema/API/security impact:** none beyond confirming the existing data-deletion callback route is correctly linked from the new privacy page.

**Dependencies:** MR-5 (the landing page needs a real customer signup destination to point to — selling a product with no working signup flow is itself a false claim).

**Risks:** legal-page content (privacy/terms) should be reviewed by someone qualified to do so before being presented as binding — this plan can scaffold the pages and structure but flags that legal review is a human sign-off step, not an engineering deliverable this plan can self-certify.

**Acceptance criteria:** landing page accurately describes the automation product and links to a working signup flow; Privacy/Terms pages exist and are linked from the footer/signup flow; `robots.txt`/sitemap exist and are valid.

**Automated verification:** Playwright test confirming every footer/legal link resolves (no 404s), confirming metadata tags are present per page.

**Manual verification:** a plain-language read-through confirming no claim on the page is unsupported by evidence from earlier milestones.

**Rollback strategy:** plain revert; no data/schema involved.

**Definition of completion:** the landing page, when read cold by someone unfamiliar with the codebase, correctly identifies Instagram comment automation as the product being sold, with working legal pages and no unverified claims.

---

## MR-7: Plans, usage limits, and billing

**Objective:** today there is no subscription/plan system at all — Razorpay exists only as an unwired one-off payment gateway for the legacy product (`docs/MARKET_READINESS_BASELINE.md §3`). This milestone makes the automation product genuinely commercial.

**Exact scope:**
- Define a single beta plan tier (per `docs/PRODUCT_BOUNDARY_DECISION.md §3`, "a single paid plan is sufficient for beta") with a usage limit appropriate to keep beta costs/risk bounded (e.g. a campaign count or comment-volume cap — exact numbers are a Product Owner decision at implementation time, not fixed here).
- Wire a real payment/subscription flow gating workspace activation — a workspace cannot run live automation (send real DMs/replies) until payment is genuinely verified, not merely "a payment record exists."
- Enforce the usage limit server-side (not just displayed in UI) — the pipeline itself must refuse to process beyond the plan's bound.
- Decide whether to activate the existing Razorpay scaffolding for this or introduce a subscription-capable gateway; either choice must result in an actually-tested, actually-wired payment path, unlike today's untested scaffolding.

**Explicit exclusions:** no multiple plan tiers. No usage-based/metered billing complexity beyond a simple cap. No self-service plan upgrades/downgrades beyond what's needed to activate the single beta plan.

**Expected files/system areas:** new billing-related API routes, `SocialAccount`/`Campaign` (or a new `Subscription`/`Plan` model) gaining a plan/limit reference, pipeline-stage guards (`services/pipeline-orchestrator.ts` or upstream) enforcing the usage cap.

**Schema/API/security impact:** likely a small, justified schema addition (a `Subscription` or `Plan` concept tied to `Workspace`). Payment webhook handling must be reviewed with the same signature-verification rigor already correctly applied to Meta's webhooks.

**Dependencies:** MR-4 (billing is workspace-scoped, requires tenancy to exist).

**Risks:** a workspace that stops paying but isn't correctly deactivated could keep running live automation for free, or worse, a bug in the gate could block a paying customer — both directions need explicit test coverage.

**Acceptance criteria:** a workspace cannot send a real DM/reply until its payment is genuinely, verifiably active; exceeding the usage cap stops processing server-side with a clear customer-visible signal, not a silent failure.

**Automated verification:** tests asserting the pipeline refuses to process for an unpaid/over-limit workspace, and proceeds normally for a paid, within-limit one.

**Manual verification:** a real test transaction against the chosen payment gateway's real test/sandbox mode — "cannot be tested from this sandbox" is not an acceptable final state for this milestone, unlike the current Razorpay scaffolding note; MR-9 explicitly requires real payment verification before launch.

**Rollback strategy:** feature-flag the billing gate off (falls back to unrestricted/free operation) if a production billing bug is found — documented as a deliberate, temporary, monitored fallback, not a silent default.

**Definition of completion:** a real (sandbox/test-mode) end-to-end payment activates a workspace, and a real over-limit attempt is correctly blocked, both with evidence captured.

---

## MR-8: Production infrastructure, R2 decision, distributed rate limiting, and observability

**Objective:** close the confirmed production-infrastructure gaps: local storage doesn't survive Vercel redeploys and R2 is a safe-failing placeholder with no real implementation (`docs/STORAGE.md`, `docs/MARKET_READINESS_BASELINE.md §4`); rate limiting is in-memory/per-instance and its IP key is spoofable; there is no distributed cron/queue infrastructure beyond what MR-3 minimally wires; no dedicated production observability/alerting exists beyond the Monitoring page's manual-refresh view.

**Exact scope:**
- Implement `R2StorageProvider` for real (S3-compatible client — `docs/STORAGE.md:36-37` already names `@aws-sdk/client-s3` + presigner as the anticipated dependency), provision a real bucket, wire real credentials, and write/verify the local-file migration script `docs/STORAGE.md:52-61` already scopes but explicitly leaves unwritten. **Only needed if the legacy upload/delivery feature, or any future automation-product feature that stores files, is retained through launch** — this decision itself must be made and recorded here, not assumed.
- Replace in-memory rate limiting with a distributed mechanism (Redis/Upstash or equivalent) sized for real multi-instance serverless deployment, and fix the client-IP derivation to trust only the deployment platform's canonical header (not an arbitrary client-supplied one).
- Production observability: structured logging is already in place (`lib/logger.ts`) — this milestone adds actual alerting (a failed-pipeline-rate threshold, a token-expiry-approaching notice, a payment-webhook-failure alert) wired to a real notification channel, not just a page an operator has to remember to check.
- Confirm/apply GitHub branch protection on `main` (flagged as unconfirmed in the baseline) as part of this milestone's operational hardening, since it's a genuine, currently-open gap with a trivial fix once someone with repo-admin access executes it.

**Explicit exclusions:** no multi-region deployment. No custom infrastructure beyond what Vercel + the chosen storage/cache providers require. No enterprise SLA tooling.

**Expected files/system areas:** `lib/modules/storage/r2-storage-provider.ts` (real implementation), `lib/modules/security/rate-limit.ts` (replaced backend), new alerting integration code, `package.json` (new SDK dependencies — the first milestone in this plan expected to add real cloud-service dependencies), `.env.example` (new credential variables).

**Schema/API/security impact:** new credentials in the environment (R2 keys, rate-limit backend connection string, alerting webhook/API key) — all must follow the existing one-secret-per-concern pattern already used throughout `.env.example`. R2 credentials must never be logged (consistent with the existing discipline around `TOKEN_ENCRYPTION_KEY`/`pageAccessToken`).

**Dependencies:** MR-3 (cron infrastructure groundwork), and effectively everything before it, since this is the "make it actually production-grade" milestone.

**Risks:** real cloud credentials and infrastructure connections are the highest-blast-radius category of change in this entire plan — must be done in a dedicated environment with reversible provisioning (a bucket/cache instance that can be torn down without customer impact) before any production cutover.

**Acceptance criteria:** file storage survives a real redeploy in the target production environment; rate limiting holds correctly under a multi-instance simulation; at least one alerting path has been proven to actually fire (a deliberately-triggered failure produces a real notification).

**Automated verification:** the existing storage provider test suite extended to run against real R2 (in a test bucket) rather than only the placeholder; a rate-limit test proving the distributed backend correctly shares state across simulated concurrent instances.

**Manual verification:** a real deploy-redeploy cycle confirming files survive; a real deliberate alert-trigger confirming the notification arrives.

**Rollback strategy:** `STORAGE_DRIVER` can revert to `local` (existing, working default) if R2 issues arise; rate limiting can fall back to the existing in-memory implementation (degraded but functional) if the distributed backend has problems — both fallbacks already exist in the codebase today and don't need to be built.

**Definition of completion:** production storage, rate limiting, and at least baseline alerting are real, tested, and documented — not placeholders — for whichever features are retained through launch per this milestone's own storage-necessity decision.

---

## MR-9: Full staging verification, Meta/payment/security/accessibility testing, and launch acceptance

**Objective:** the only milestone permitted to recommend a launch decision. Everything before this proves individual pieces work; this milestone proves the whole system works together, in a production-like environment, against real external dependencies.

**Exact scope:**
- Full staging deployment mirroring intended production configuration (real storage decision from MR-8, real rate-limit backend, real cron).
- Real Meta sandbox/test-account verification: a genuinely Meta-approved test Instagram Business account, full OAuth connect → campaign → real comment → real DM/reply cycle, observed and recorded.
- Real payment verification against the chosen gateway's test mode, including the usage-cap enforcement from MR-7.
- Security review pass covering everything flagged across this plan (MR-2's concurrency fix, MR-4's tenant isolation, the still-open OAuth state timing-safety gap from the baseline if not already closed in an earlier milestone, rate-limiting under MR-8).
- Accessibility and responsive/cross-browser check across the customer-facing surfaces built in MR-5/MR-6 (this plan does not assume MR-5/MR-6 nail accessibility on the first pass — this is the dedicated verification gate).
- Database backup/restore drill, deployment rollback drill (an actual practiced rollback, not a documented procedure nobody has run).
- Compile the final launch checklist (`docs/MARKET_READINESS_CHECKLIST.md`) against real evidence gathered in this milestone.

**Explicit exclusions:** no new features. This milestone finds and reports gaps; it does not silently patch around them — any gap found gets its own scoped fix (potentially reopening an earlier MR if the gap is structural) before launch is recommended.

**Expected files/system areas:** a staging environment (infrastructure, not repo code); test evidence artifacts (recordings, logs, screenshots) attached to the milestone's completion record; final updates to `docs/MARKET_READINESS_CHECKLIST.md` marking items verified with evidence references.

**Schema/API/security impact:** none expected beyond fixes to whatever this milestone's testing surfaces.

**Dependencies:** MR-1 through MR-8, all complete.

**Risks:** the temptation to declare victory on partial evidence. This plan's required launch acceptance standard (below) exists specifically to prevent that.

**Acceptance criteria — MR-9 may recommend GO FOR MARKET LAUNCH only when every one of the following is independently, evidence-backed true:**
- Customer signup/onboarding works (MR-5, re-verified in staging).
- Instagram connection works with a real approved test account (not a mock).
- Workspace data is isolated (MR-4, re-verified with a real cross-tenant staging test).
- Duplicate replies are transactionally prevented (MR-2, re-verified under real concurrent load in staging).
- Failed jobs are recoverable (MR-3, re-verified with a real forced failure in staging).
- Expired/disconnected accounts cannot send (MR-3, re-verified).
- Production storage is safe for every retained upload feature (MR-8's storage decision, re-verified with a real redeploy in staging).
- Billing is genuinely verified before activation (MR-7, re-verified with a real test-mode transaction).
- Privacy, terms, and data-deletion workflows exist and function (MR-6, re-verified).
- Security, accessibility, responsive, and browser checks pass (this milestone's own dedicated testing pass).
- Monitoring and rollback procedures are operational (MR-8 alerting proven to fire; a rollback has actually been practiced, not just documented).
- No unresolved Critical or High launch blocker remains anywhere in `docs/MARKET_READINESS_CHECKLIST.md`.

**Automated verification:** the full CI suite (MR-1) plus a staging-specific verification run covering every item above where automatable.

**Manual verification:** each acceptance-criterion bullet above requires a named piece of real evidence (a recording, a log excerpt, a screenshot, a transaction ID) attached to the milestone record — "should work" is not evidence.

**Rollback strategy:** N/A to this milestone itself (it is a verification gate, not a deploy); its output is a GO/NO-GO recommendation with named blockers if NO-GO.

**Definition of completion:** either (a) a GO recommendation with every acceptance criterion above backed by named evidence, delivered to the Product Owner/Chief Architect for the actual launch decision, or (b) a NO-GO recommendation naming every remaining Critical/High blocker and which earlier MR milestone must be reopened to address it. **This document does not itself authorize launch — MR-9's output is a recommendation for human decision-makers, consistent with this plan never declaring the product launch-ready on its own authority.**
