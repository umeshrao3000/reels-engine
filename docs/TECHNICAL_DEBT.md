# Technical Debt Register — Remaining Only

Superseded version of the Forensic Audit's Technical Debt Register. Closed items are omitted entirely per the "remaining only" instruction — see `HARDENING_REPORT.md` for what was closed and when.

| Item | Severity | Status |
|---|---|---|
| Direct upload (`app/api/projects/route.ts`) buffers the full file into memory during multipart parsing, before the size cap can reject an oversized upload | Low (bounded resource exhaustion) | Open — deliberately deferred to the production storage backend decision, which will likely change the upload strategy to streaming anyway. Fixing it twice would be wasted work. |
| Route-handler-level uncaught DB errors (e.g. a lost connection mid-request) still surface as a generic error to the API caller | Low (UX, API responses only) | Open — page-rendering failures now get a friendly boundary (`app/error.tsx`), which was the audit's actual concern; wrapping every route handler's Prisma calls individually is not justified at V1's traffic scale. |
| `Revision` Prisma model and a few `Project` fields (`revisionCount`, service-package flags) have zero application-code references | None (by design) | Open, intentionally — forward-looking schema surface for features not yet in V1 scope. Zero risk as unused columns. |
| Production storage backend not yet chosen; local disk does not survive redeploys/restarts on Vercel | High (production blocker) | Open — explicit, deliberate deferral per original Product Owner instruction ("local now, decide production backend after validating the app"). This is the single largest item remaining before real paying-customer traffic. |
| Razorpay path never verified end-to-end | Medium | Open — cannot be tested from this sandbox (network policy blocks `api.razorpay.com`/`checkout.razorpay.com` outright); requires a manual click-through on a real deployment with real test-mode credentials. Razorpay is not wired into any customer-facing UI, so this carries no current production risk — manual UPI is the only active payment path. |
| Branch protection rules on `main` not applied | Low (process) | Open — requires manual action in GitHub repository settings; no API access from this session. |
| Remote feature-branch deletion after merge | None (housekeeping) | Open — this sandbox's git proxy returns 403 on `git push origin --delete`; local branches are always deleted cleanly, remote copies need manual cleanup. Disclosed at every merge since PR #1. |
