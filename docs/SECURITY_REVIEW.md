# Security Review — M7

Re-run of the Forensic Audit's Security Review section against the current source tree (post-M5/M6/M7), not a copy of the original findings.

## Findings from the original Forensic Audit — current status

1. **Original uploads publicly downloadable, no access control.** ~~Open~~ **Closed in M5** — `GET /api/storage/[...key]` now requires an admin session (401 otherwise); customer downloads go through `/api/deliver/[token]/[uploadId]`, scoped to one project's `shareToken` and restricted to `PROCESSED` uploads only.
2. **No rate limiting anywhere.** ~~Open~~ **Closed in M7** — see below.
3. **Direct upload buffers the full file before the size check can reject it.** Still open — deliberately deferred (see `TECHNICAL_DEBT.md`), low severity, bounded.
4. **Admin passcode has no lockout/backoff.** ~~Open~~ **Closed in M7** — see below.

## M7 rate limiting / lockout — what was added and how it was verified

- `lib/modules/security/rate-limit.ts`: in-memory, IP-keyed, fixed-window limiter. No new infrastructure (no Redis/Upstash) — matches V1's single-instance scale and the freeze rule against introducing new infra. Explicitly documented as best-effort: each serverless instance has its own memory, so this is a throttle against casual abuse/brute-force, not a distributed hard guarantee — which is exactly the bar the original audit asked for ("add basic rate limiting").
- Applied to `POST /api/admin/login` (5 attempts / 15 min per IP), `POST /api/projects` (20 / 10 min), `POST /api/projects/[id]/payments` (10 / 10 min).
- **Verified, not assumed:** 6 consecutive login attempts with a wrong passcode from one IP returned `401, 401, 401, 401, 401, 429`. A *correct* passcode submitted immediately after returned `429` as well — confirming this is a real lockout (blocks all further attempts once tripped), not just a failed-attempt counter. `Retry-After` header confirmed present on the 429 response. A concurrent request to an unrelated endpoint (`POST /api/projects`) succeeded normally, confirming the limiter is scoped correctly and doesn't over-block.

## Fresh sweep (this milestone, not carried forward from the old audit)

- `grep` across `app/` and `lib/` for `TODO`, `FIXME`, `XXX`, `HACK`, `console.log/warn/error`, `debugger` → zero matches.
- `grep` for `dangerouslySetInnerHTML`, `eval(`, `new Function(` → zero matches. No XSS injection surface beyond React's default protections.
- `grep` for `$queryRaw`/`$executeRaw` → zero matches. No raw SQL anywhere; all queries go through Prisma's parameterized query builder.
- Secrets: still sourced exclusively from `process.env`, `.env` still git-ignored and untracked (unchanged since the original audit, reconfirmed).
- Timing-safe comparisons (`crypto.timingSafeEqual`) for both the admin passcode and session-signature checks — unchanged, still correct.
- Razorpay webhook signature verification (HMAC-SHA256 over the raw body, timing-safe, fails closed when unconfigured) — unchanged, still correct.

## Remaining open items

See `TECHNICAL_DEBT.md`. Nothing found in this pass rises to a severity that blocks continuing to M8 — the one item that blocks real production traffic regardless of code quality is the still-undecided production storage backend, which was never in scope for M7 and is explicitly a launch-preparation decision.
