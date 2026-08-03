# Production Readiness — as of M7

Status snapshot for go-live planning. This is an assessment, not a launch checklist execution — M8 (Launch Preparation) owns actually acting on the blockers below.

## Ready

- ✅ Core customer flow: upload → pay (manual UPI) → admin verifies → admin edits/uploads finished file → customer downloads, fully built and manually verified end-to-end (M3–M6).
- ✅ CI/CD: GitHub Actions CI (typecheck, lint, migration verification against real Postgres, build, audit) and CodeQL, both green on every milestone, verified via direct API queries at each merge — never assumed.
- ✅ Access control: admin surface passcode-gated with HMAC-signed sessions and timing-safe comparisons; customer file access scoped to unguessable `shareToken`s; the previously-public storage route is now admin-only.
- ✅ Rate limiting / lockout: basic in-memory protection on admin login and the two unauthenticated public POST endpoints (M7).
- ✅ Input validation: every API route validates its actual inputs (see `VALIDATION_CHECKLIST.md`); no unbounded fields remain.
- ✅ Error handling: friendly fallback UI for page-rendering failures and unknown routes (M7), replacing Next's default generic pages.
- ✅ No secrets in source; `.env` git-ignored and confirmed untracked.
- ✅ Zero `TODO`/`FIXME`/dead code/mock implementations anywhere in the tracked source tree (confirmed via fresh grep this milestone).

## Not ready — must be resolved before real paying-customer traffic

1. **Production storage backend (Cloudflare R2) is implemented but not connected.** `STORAGE_DRIVER` still defaults to `local`; local disk does not survive redeploys/restarts on Vercel. The V1 Production Hardening Sprint's first PR added the `StorageProvider` abstraction (`docs/STORAGE.md`) and a fully-coded `R2StorageProvider`, tested only against a fake client — no bucket/credentials/API keys exist yet. Turning it on is now a config + migration-script task, tracked as its own follow-up milestone rather than an open-ended blocker.
2. **Razorpay is unverified end-to-end** and not wired into any customer-facing UI. Not a blocker for launch on manual UPI alone, but must not be switched on without a manual click-through test against a real deployment first (cannot be tested from this sandbox — network policy blocks Razorpay's API hosts outright).
3. **Branch protection on `main`** has not been applied — requires manual action in GitHub repository settings, no API path available from this session.

## Manual housekeeping (non-blocking)

- Remote feature branches from every completed milestone (`claude/m3-upload-flow`, `claude/m4-payments`, `claude/m5-delivery-share`, `claude/m6-admin-core`, `claude/m7-hardening`, plus the original `claude/github-vercel-connection-ln7dgj`) remain on `origin` — this sandbox's git proxy returns 403 on remote branch deletion. Local branches are always deleted cleanly after each merge. Needs a manual sweep from an environment with real push-delete access.

## Explicitly out of scope for "production readiness" at this stage

Per the V1 Freeze Rule: authentication/accounts, RBAC, notifications, analytics, AI, automation, CRM, multi-tenancy, and cloud storage migration are Version 2 concerns and are correctly absent, not gaps.
