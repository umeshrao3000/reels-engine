# Market Readiness Checklist

Practical, checkbox-based launch checklist. Every item classifies as exactly one of:
- 🔴 **Launch blocker** — MR-9 cannot recommend GO while this is unchecked.
- 🟡 **Required before paid customers** — beta can run without it, but no real money changes hands until it's checked.
- 🟢 **Safe post-beta improvement** — genuinely deferrable per `docs/PRODUCT_BOUNDARY_DECISION.md`.

Every item maps to the MR milestone that closes it. `[ ]` = not started (accurate as of this Phase 0 baseline — nothing below is checked, because no MR milestone has begun).

---

## Product

- [ ] 🔴 Landing page describes and sells Instagram comment automation as the primary product, not the legacy Reel Makeover framing — *MR-6*
- [ ] 🟡 Legacy Reel Makeover product remains functional and unbroken through launch — *baseline, verify continuously across MR-1–MR-9*. **MR-1 evidence:** `e2e/landing-page.spec.ts` now gives this continuous automated regression coverage (upload → pay page, link paste → status page, invalid-link rejection), plus reusable browser `pageerror`/console-error detection (`e2e/support/fixtures.ts`), required in the `Playwright E2E` CI job on every PR.
- [ ] 🟢 Legacy Reel Makeover product's long-term product status (sunset vs. retain) decided — *post-beta, per `docs/PRODUCT_BOUNDARY_DECISION.md §2`*

## Customer onboarding

- [ ] 🔴 A new customer can sign up without staff intervention — *MR-5*
- [ ] 🔴 A new customer can connect their own real Instagram account via OAuth — *MR-5*
- [ ] 🔴 A new customer can create a campaign and keywords and see it go live — *MR-5*
- [ ] 🟡 Onboarding golden path covered by an automated Playwright test — *MR-1, MR-5*. **MR-1 evidence:** `e2e/automation-golden-path.spec.ts` covers the admin-side path (login → campaign create → keyword add/disable → real signed-webhook matching → Monitoring page verification) and `e2e/landing-page.spec.ts` covers the visitor-side path, both required in the `Playwright E2E` CI job (8/8 passing). Missing `ADMIN_PASSCODE`/`META_APP_SECRET` fails the suite outright (verified) rather than silently skipping it. Not checked yet — the self-serve *customer* signup golden path this item is jointly scoped for doesn't exist until MR-5.

## Authentication

- [ ] 🔴 Real per-user authentication replaces the single shared admin passcode — *MR-4, superseded by MR-3.1 (Beta SaaS Build Program) for the customer-facing side*. **MR-3.1 evidence:** real customer sign-up/login/session-management now exists (`lib/auth/server.ts`, better-auth — email+password, scrypt-hashed, DB-backed sessions, real on-by-default rate limiting and CSRF origin-checking), verified via 8 API-route tests (`test/api/auth-routes.test.ts`) and a real-browser Playwright spec (`e2e/customer-auth.spec.ts`). Not checked — this *adds* a separate customer identity system, it does not touch or replace `ADMIN_PASSCODE` (the internal `/ops` admin surface is explicitly out of scope for this milestone, `docs/MARKET_READINESS_MASTER_PLAN.md`'s Beta SaaS Build Program addendum), and password reset is not yet end-to-end functional — see `docs/EMAIL_PROVIDER.md`.
- [ ] 🔴 A distinct internal super-admin role exists, separate from workspace-owner accounts — *MR-4*. Unaffected by MR-3.1 — no workspace/organization concept exists yet (MR-3.2).
- [ ] 🟡 Session/token handling reviewed for the new auth system (expiry, revocation) — *MR-4, MR-3.1*. **MR-3.1 evidence:** session tokens are DB-backed (`Session` table, better-auth default 7-day expiry, revoked on sign-out — verified in `test/api/auth-routes.test.ts`), not a hand-rolled scheme. Not checked — a full review (rotation policy, concurrent-session limits) is deferred pending real usage.
- [ ] 🟢 Team seats / multiple users per workspace — *explicitly deferred, `docs/PRODUCT_BOUNDARY_DECISION.md §5`*

## Tenant isolation

- [ ] 🔴 `Workspace`/`User` models exist and every automation-related model is workspace-scoped — *MR-4*
- [ ] 🔴 Every `/ops`-equivalent query is provably scoped to the authenticated workspace (no unscoped `findMany` remains) — *MR-4*
- [ ] 🔴 Cross-tenant data-isolation test suite passes (two workspaces, zero leakage, every resource type) — *MR-4*
- [ ] 🟡 Manual cross-tenant access attempt (URL manipulation) confirmed blocked — *MR-9*

## Meta integration

- [ ] 🟡 OAuth connect/callback flow re-verified against current Meta app review requirements — *MR-5, MR-9*
- [ ] 🔴 Real Meta-approved test Instagram Business account used for end-to-end verification — *MR-9*
- [ ] 🟡 OAuth CSRF state comparison uses constant-time comparison throughout (currently one plain `!==` gap at `lib/modules/meta/oauth-state.ts:33`) — *MR-2 or MR-4, whichever touches this file first*
- [ ] 🟢 App Review / advanced Meta permissions status tracked outside this repo (external, not a code deliverable)

## Automation reliability

- [ ] 🔴 Concurrent pipeline execution cannot produce a duplicate DM or public reply — *MR-2*
- [ ] 🔴 Concurrent-execution regression test exists and passes in CI — *MR-1, MR-2*. **MR-1 evidence:** CI now runs two separately-named, independently failing, required jobs on every PR — `Unit and integration` (`npm test`, 87 tests: webhook signature verification, trigger matching incl. word-boundary matching, admin sessions, OAuth state, keyword normalize/service, and Node-native campaign/keyword API-route tests exercising real HTTP against the built app) and `Playwright E2E` (`npm run test:e2e`, 8 tests). Neither job uses `continue-on-error`, `--if-present`, or other false-success mechanisms. This is the regression foundation the concurrency test itself will run on. Not checked — the concurrency test requires MR-2's locking implementation first, explicitly out of MR-1 scope.
- [ ] 🟡 Pipeline behavior re-verified against real webhook traffic in staging — *MR-9*

## Duplicate prevention

- [ ] 🔴 `commentId` uniqueness continues to guarantee webhook-level idempotency (already true today — re-verify unchanged) — *MR-2, MR-9*
- [ ] 🔴 Row-level claim/lock mechanism prevents double-processing under concurrency — *MR-2*

## Retry and recovery

- [ ] 🔴 `FAILED` rows are automatically retried within a bounded backoff window — *MR-3*
- [ ] 🔴 A scheduled entry point (cron) actually calls the existing batch-recovery functions — *MR-3*. **Phase A evidence:** `app/api/cron/automation/route.ts` (fail-closed `CRON_SECRET` auth, DB-backed overlap lock, per-item deadline) runs the matcher/private-reply/public-reply/finalize/token-refresh batches, retry-due rows included automatically. Scheduled by `.github/workflows/automation-cron.yml` — GitHub Actions, every 5 minutes (offset from the hour), no cost, chosen over Vercel's cron (Hobby plan only permits daily, too coarse for the 30s–30min retry backoff window) and over a paid Vercel upgrade. GitHub's scheduler is best-effort, not a hard real-time guarantee; the route's own claim/retry/lock logic is what's actually authoritative for correctness, not the trigger cadence. Not checked — scheduled workflows only start firing once this workflow is on `main`; activation isn't confirmed until the post-merge gate (manual `workflow_dispatch` + one observed scheduled run, no duplicate/overlapping processing) passes.
- [ ] 🟡 Retry behavior re-verified under a real forced failure in staging — *MR-9*
- [ ] 🟢 Customer-configurable retry policy — *explicitly deferred, `docs/PRODUCT_BOUNDARY_DECISION.md §5`*

## Token lifecycle

- [ ] 🔴 `refreshLongLivedToken` is actually called on a schedule before expiry — *MR-3*
- [ ] 🔴 A `DISCONNECTED`/`TOKEN_EXPIRED` account is never attempted by the pipeline — *MR-3*
- [ ] 🟡 Token-expiry alerting reaches a real notification channel, not just the Monitoring page — *MR-8*

## Billing

- [ ] 🟡 A single beta plan tier is defined with an enforced usage limit — *MR-7*
- [ ] 🔴 A workspace cannot run live automation without genuinely verified payment — *MR-7* (blocker specifically for paid-customer launch; beta with free/trial workspaces can proceed without this checked)
- [ ] 🟡 Usage cap enforcement re-verified with a real test-mode transaction — *MR-9*
- [ ] 🟢 Multiple plan tiers / metered billing — *explicitly deferred, `docs/PRODUCT_BOUNDARY_DECISION.md §5*

## Storage

- [ ] 🟡 Decision recorded on whether any launch feature requires durable file storage — *MR-8*
- [ ] 🔴 *(only if storage is retained)* Real R2 (or equivalent) implementation replaces the placeholder, verified to survive a real redeploy — *MR-8*
- [ ] 🟢 Local-file-to-R2 migration script — *only needed if legacy uploads are retained through the storage cutover, MR-8*

## Security

- [ ] 🟡 OAuth state timing-safety gap closed (see "Meta integration" above; listed here too since it's a security item)
- [ ] 🔴 Dedicated security review pass covering MR-2 (concurrency), MR-4 (tenancy), MR-7 (payment webhooks), MR-8 (rate limiting) — *MR-9*
- [ ] 🟡 `npm audit --audit-level=critical` remains a hard CI gate (already true today — keep it true) — *ongoing*
- [ ] 🟢 Formal third-party penetration test — *post-beta*

## Rate limiting

- [ ] 🟡 Distributed rate-limit backend replaces in-memory, per-instance limiting — *MR-8*
- [ ] 🔴 Client-IP derivation trusts only the deployment platform's canonical header, not an arbitrary client-supplied one — *MR-8*
- [ ] 🟡 Rate limiting re-verified under simulated multi-instance load — *MR-8, MR-9*

## Privacy and legal

- [ ] 🔴 Privacy Policy published and linked from signup/footer — *MR-6*
- [ ] 🔴 Terms of Service published and linked from signup/footer — *MR-6*
- [ ] 🟡 Data-deletion workflow is customer-visible and documented, not just a technical Meta callback — *MR-6*
- [ ] 🟢 Legal counsel review of Privacy/Terms content — *human sign-off step, tracked outside this repo*

## Accessibility

- [ ] 🟡 Accessibility pass on customer-facing signup/workspace/landing pages — *MR-9*
- [ ] 🟢 Full WCAG conformance audit — *post-beta improvement, unless a specific commitment requires it sooner*

## Responsive design

- [ ] 🟡 Customer-facing pages verified on mobile/tablet/desktop breakpoints — *MR-9*
- [ ] 🟢 Native mobile app — *explicitly deferred, `docs/PRODUCT_BOUNDARY_DECISION.md §5`*

## SEO and metadata

- [ ] 🟡 `robots.txt` and `app/sitemap.ts` exist (currently absent) — *MR-6*
- [ ] 🟡 Per-page `<title>`/description metadata corrected for the automation product — *MR-6*
- [ ] 🟢 Structured data / rich-result markup — *post-beta*

## Performance

- [ ] 🟡 Storage/rate-limit changes (MR-8) verified not to regress request latency — *MR-8, MR-9*
- [ ] 🟢 Formal load testing beyond MR-9's staging pass — *post-beta, unless real traffic projections require it sooner*

## Monitoring and alerts

- [ ] 🔴 At least one alerting path (failed-pipeline threshold, token-expiry, payment-webhook failure) proven to actually fire — *MR-8*
- [ ] 🟡 Existing Monitoring page re-scoped correctly per-workspace for customer view, and unrestricted for internal super-admin — *MR-4, MR-5*

## Database backup and restore

- [ ] 🔴 A real backup/restore drill has been practiced, not just documented — *MR-9*
- [ ] 🟡 Backup cadence and retention decided and configured for the production database — *MR-8*

## Deployment and rollback

- [ ] 🔴 A real rollback has been practiced against staging, not just documented — *MR-9*
- [ ] 🟡 Branch protection on `main` confirmed applied (currently unconfirmed — `CONTRIBUTING.md` contains an internal contradiction on this point) — *MR-8, MR-9*
- [ ] 🟡 CI required-status-check enforcement confirmed (same caveat as above) — *MR-8, MR-9*

## Support procedures

- [ ] 🟡 Internal super-admin has a documented process for diagnosing a customer's stuck/failed automation via Monitoring — *MR-4, MR-8*
- [ ] 🟢 Formal support-ticket tooling / SLA — *post-beta*

## Data export and deletion

- [ ] 🔴 A customer can request deletion of their workspace data and it is honored end-to-end — *MR-6, building on the existing Meta-mandated data-deletion callback*
- [ ] 🟡 A customer can export their own data (campaigns, keywords, conversion history) — *MR-5 or MR-6, exact placement is an implementation-time decision*

## Real Meta sandbox verification

- [ ] 🔴 Full OAuth connect → campaign → real comment → real DM/reply cycle observed against a real, Meta-approved test account — *MR-9*

## Real payment verification

- [ ] 🔴 A real test-mode transaction activates a workspace and is verified end-to-end — *MR-9*

## Production-like staging

- [ ] 🔴 A staging environment mirrors the intended production configuration (storage decision, rate-limit backend, cron) — *MR-9*

## Final launch decision

- [ ] 🔴 Every Critical/High item in this checklist is checked with named evidence before MR-9 recommends GO — *MR-9*
- [ ] 🔴 GO/NO-GO recommendation delivered to Product Owner / Chief Architect for human decision — *MR-9*
- [ ] 🔴 This document does not authorize launch by itself — a human decision-maker makes the final call — *always true, never delegated to automation*

---

## Coverage confirmation

Every checklist item above maps to exactly one of MR-1 through MR-9 (or an explicit "ongoing"/"external, tracked outside this repo" note where the item isn't a discrete milestone deliverable). No item is unmapped; no MR milestone is without at least one checklist item. This checklist is authoritative for MR-9's final acceptance pass — it is updated with real evidence references as each MR milestone completes, not rewritten from scratch at the end.
