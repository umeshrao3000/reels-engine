# Performance Review — M7

Review-only pass; no performance-motivated code changes were needed.

## Query patterns

- Every list-rendering `.map()`/`.forEach()` in `app/**/*.tsx` (checked: projects list, project detail, reports, payments, customer status page — 5 files) operates on data already fetched in a single query for that page. No N+1 pattern found.
- `app/ops/(protected)/reports/page.tsx` runs 5 aggregate/count queries in parallel via `Promise.all` rather than sequentially — already efficient.
- `app/ops/(protected)/projects/[id]/page.tsx` fetches the project with `payments` and `uploads` included in one `findUnique` call, not separate round-trips.

## Indexes

- `Payment.projectId` and `Upload.projectId` — indexed (`@@index([projectId])` in `prisma/schema.prisma`).
- `Project.shareToken` — unique, indexed.
- `Project.id` — primary key.
- **Not indexed:** `Project.status`, filtered on in the admin projects list (`app/ops/(protected)/projects/page.tsx`). Acceptable at V1's expected row counts (a single-owner ₹500 service business, not high-volume SaaS); flagged here as a future consideration only if project volume grows large enough for a full-table scan to matter, not urgent now.

## Storage

- `LocalStorageAdapter` uses `fs/promises` throughout (`readFile`, `writeFile`, `stat`, `unlink`) — all non-blocking, no synchronous I/O found.
- File downloads (`/api/deliver`, `/api/storage`) buffer the full file into memory (`getBuffer`) rather than streaming. Acceptable at V1's file sizes and traffic; the same "streaming rewrite belongs with the storage-backend migration" reasoning from `TECHNICAL_DEBT.md` applies here too — not duplicated as a separate item, just noted.

## Build output

- Production build (`next build`) compiles in ~5s, 19 routes, no warnings.
- No heavy client-side dependencies were added in M5/M6/M7 — `qrcode` (M4) remains the only non-framework runtime dependency of note; everything else is Next.js/React/Prisma/Tailwind.

## Conclusion

No changes made under this milestone. Nothing found that would affect real-world performance at V1's expected traffic (a single-editor, manual-fulfillment service business).
