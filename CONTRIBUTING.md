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

- `main` is protected: no direct pushes, PRs only.
- Branch off `main` for every change; keep PRs scoped to one milestone or
  concern.
- Fill out the PR template — Summary, Modified Files, Testing Completed,
  Screenshots (UI changes), Risks, Rollback Plan.
- CI (`.github/workflows/ci.yml`) must pass: install, Prisma generate, type
  check, lint, migration verification, build, unit tests (when present),
  security audit.
- Resolve all review conversations before merge.
- Your branch must be up to date with `main` before merging (rebase or merge
  `main` in, don't just click through a stale merge).
- No force-pushes to `main`, ever.

### Required GitHub branch protection (configured in repo Settings, not by CI)

This can't be set from inside the app or CI — it's a one-time setting an
admin applies in **Settings → Branches → Branch protection rules** for
`main`:

- Require a pull request before merging
- Require status checks to pass before merging → select the `CI` workflow's
  job
- Require branches to be up to date before merging
- Require conversation resolution before merging
- Do not allow force pushes
- Do not allow deletions
- (Optional but recommended) Require at least 1 approval once there's more
  than one contributor

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
