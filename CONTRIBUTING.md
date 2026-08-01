# Contributing

Engineering workflow for reels-engine. This is a small, modular-monolith
Next.js app — keep changes proportional to that.

## Local setup

1. Node: use the version pinned in `.nvmrc` (`nvm use`).
2. PostgreSQL: self-managed, no cloud DB. Point `DATABASE_URL` (see
   `.env.example`) at a local Postgres instance and create the database:
   ```
   createdb reels_engine
   ```
3. Copy `.env.example` to `.env` and fill in local values.
4. Install and set up:
   ```
   npm ci
   npx prisma generate
   npx prisma migrate dev
   npm run dev
   ```

File storage in dev goes through the Storage Service (`lib/modules/storage`)
to a local `.storage/` folder (gitignored). Never write files outside that
abstraction — the production storage backend will be swapped in later behind
the same interface.

## Before opening a PR

Run what CI runs, so nothing surprises you:

```
npm ci
npx prisma generate
npx next typegen             # required before typecheck (generates RouteContext etc.)
npm run typecheck
npm run lint
npx prisma migrate deploy   # against a throwaway/local DB
npm run build
npm test --if-present
npm audit --audit-level=critical
```

## Branching & PRs

This is currently a single-owner project, so governance is intentionally
light — just enough to stop accidental mistakes, not enough to slow you down.

- `main` is protected: no direct pushes, PRs only.
- Branch off `main` for every change.
- Fill out the PR template (it's short — summary, testing, risk).
- CI must pass: install, Prisma generate, type check, lint, migration
  verification, build, unit tests (when present), security audit.
- No force-pushes to `main`, ever.
- No required reviewers, no approval chains, no merge queue — merge once CI
  is green.

### Required GitHub branch protection (configured in repo Settings, not by CI)

This can't be set from inside the app or CI — it's a one-time setting an
admin applies in **Settings → Branches → Branch protection rules** for
`main`. Keep it to exactly this, nothing more:

- Require a pull request before merging
- Require status checks to pass before merging → select the `CI` workflow's
  job
- Do not allow force pushes

Deliberately not enabled: required approvals, required conversation
resolution, "require branches up to date," merge queues. Add them later if
the team grows past one owner — not before.

CodeQL runs on every PR as an informational scan (Security tab), not as a
required/blocking check — it shouldn't hold up a merge.

## Dependency updates

Dependabot checks npm and GitHub Actions dependencies weekly and opens PRs
for updates (`.github/dependabot.yml`). Same CI gate applies to those PRs as
any other.

## Security audit policy

`npm audit --audit-level=critical` is a hard CI gate. High/moderate findings
run as an informational, non-blocking step. As of this writing there are
known high-severity advisories (`postcss`, `sharp`) that live *inside*
`next`'s own dependency tree with no fix available short of downgrading
Next.js to an unrelated ancient version — they're tracked, not ignored. If
`npm audit fix` (without `--force`) ever resolves them, take it.

## Adding a new Storage backend later

Implement the `StorageService` interface in `lib/modules/storage/types.ts`,
add a new adapter (mirroring `local-storage-adapter.ts`), and wire it into
the `switch` in `lib/modules/storage/index.ts` behind a new `STORAGE_DRIVER`
value. No caller code should need to change.

## Scope discipline

Per the project brief: build only what the current milestone needs. Future
phases (Keywords, Automation, Monitoring, customer accounts, RBAC) are
tracked in the roadmap, not scaffolded in code ahead of time.
