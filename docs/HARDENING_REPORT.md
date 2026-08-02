# M7 — Hardening Report

**Scope:** Production hardening only, per the approved M7 authorization — no new features, no UI redesign, no architecture changes. Every item below traces to a specific finding in the Forensic Audit's Technical Debt Register (produced before M5) that was still open at the start of this milestone.

## Changes Made

| Change | Closes | Evidence |
|---|---|---|
| In-memory rate limiter (`lib/modules/security/rate-limit.ts`), applied to `POST /api/admin/login` (5/15min), `POST /api/projects` (20/10min), `POST /api/projects/[id]/payments` (10/10min) | Audit findings #2 ("no rate limiting anywhere") and #4 ("admin passcode has no lockout/backoff") | Manually verified: 6 login attempts from one IP → first 5 return 401 (wrong passcode), 6th returns 429; a *correct* passcode submitted after the limit is hit also returns 429 (confirms this is a real lockout, not just failed-attempt counting) |
| Length caps on `assignedEditor` (100 chars), `internalNotes`/`editorNotes` (5,000 chars) in `PATCH /api/admin/projects/[id]` | Previously-unbounded string input on an admin-only but unvalidated endpoint | Code review — these fields had no length validation prior to this milestone |
| `app/error.tsx`, `app/not-found.tsx` — friendly fallback UI instead of Next's default generic pages | Audit finding: "Generic 500 on uncaught DB errors... currently shows no user-friendly message" | Manually verified: unknown routes and unknown share tokens now render styled "Not found" UI instead of the framework default; used `unstable_retry()` per this project's Next.js 16.2 docs (bundled in `node_modules/next/dist/docs`), not the older `reset()` convention, since AGENTS.md flags this build as non-standard |

## Explicitly Not Changed (with rationale)

- **Direct-upload buffering** (`app/api/projects/route.ts` reading the full file into memory during `request.formData()` parsing before the size cap can reject it): the original audit already assessed this as "acceptable for a low-traffic V1 launch; worth revisiting alongside the eventual production storage decision (which will likely also change the upload strategy to streaming)." Fixing it now would mean replacing the multipart parsing strategy — that's a storage-migration-sized change, not hardening, and doing it twice (once now, once at the real migration) would be wasted work.
- **Per-route try/catch around every Prisma call**: `app/error.tsx` now gives every page-rendering failure (including an uncaught DB error) a friendly boundary, which was the actual user-facing problem the audit flagged. Individually wrapping every route handler's database calls for a friendlier *API* error message is broad surgery for marginal benefit at V1's traffic scale.
- **Quality Checklist / revision-history feature**: this appeared in an early draft of the roadmap under a different milestone numbering, but is not part of this milestone's authorized scope ("hardening only, no feature creep"). Not built.

## Performance Review Outcome

No changes made — reviewed and found no issues:
- Grepped every `.map()`/`.forEach()` in `app/**/*.tsx` (5 files: projects list/detail, reports, payments, status page) — all operate on data already fetched in a single query per page; no N+1 pattern found.
- `Payment.projectId` and `Upload.projectId` are both indexed (`@@index([projectId])` in `prisma/schema.prisma`); `Project.shareToken` is unique (indexed); `Project.id` is the primary key. The one unindexed filter is `Project.status` in the admin projects list — acceptable at V1's expected row counts, flagged in `PERFORMANCE_REVIEW.md` as a future consideration only.

## Security Review Outcome

See `SECURITY_REVIEW.md` for the full pass. Summary: two of the four open findings from the original Forensic Audit are closed by this milestone (rate limiting, admin lockout); the other two were already closed earlier (storage access control in M5, session-check duplication in M5). Fresh greps this milestone confirm zero `TODO`/`FIXME`/`console.*`/`debugger` statements, zero `dangerouslySetInnerHTML`/`eval`, and zero raw SQL anywhere in `app/` or `lib/`.

## Verification Performed

Full local reproduction of the CI sequence (typecheck, lint, `prisma migrate deploy` on a fresh Postgres 16 DB, production build, `npm audit --audit-level=critical`), plus manual end-to-end testing against a running production build: not-found pages render correctly for unknown routes and unknown share tokens; admin login rate limiting confirmed to block both invalid and — once the limit is hit — valid credentials; unrelated endpoints (project creation) confirmed unaffected while login is rate-limited.
