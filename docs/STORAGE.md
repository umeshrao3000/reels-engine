# Storage Provider

All file I/O goes through `StorageProvider` (`lib/modules/storage/types.ts`).
Route handlers and every other caller only ever call
`getStorageProvider()` (`lib/modules/storage/index.ts`) — none of them import
a filesystem or cloud SDK directly, and none of them know which concrete
provider is active.

```ts
interface StorageProvider {
  put(key: string, data: Buffer, contentType?: string): Promise<StoredFileRef>;
  getBuffer(key: string): Promise<Buffer>;
  getDownloadUrl(key: string): Promise<string>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
```

## Providers

| Provider | File | Status |
|---|---|---|
| `LocalStorageProvider` | `local-storage-provider.ts` | Active default. Writes under `STORAGE_ROOT` on local disk. Does not survive a Vercel redeploy/restart — dev and CI only. |
| `R2StorageProvider` | `r2-storage-provider.ts` | **Placeholder only.** Implements the interface so it type-checks and can be selected via `STORAGE_DRIVER=r2`, but every method throws a clear "R2 is not connected/configured" error. No cloud SDK dependency, no client, no network call anywhere in this class. |

Selection is by `STORAGE_DRIVER` (`getStorageProvider()`), defaulting to
`"local"`. Nothing else needs to change to add a third provider — implement
`StorageProvider`, add one `case` to the switch.

## Implementing R2 (future milestone — not started)

This is deliberately deferred to its own milestone per product direction, so
that this abstraction PR carries zero cloud-provisioning risk and adds no
cloud SDK dependency. When that milestone happens, expect it to involve:

1. Adding an S3-compatible client dependency (e.g. `@aws-sdk/client-s3` +
   `@aws-sdk/s3-request-presigner`, since R2 speaks S3's API) and writing
   `put`/`getBuffer`/`getDownloadUrl`/`delete`/`exists` against it, including
   presigned download URLs since the bucket is private.
2. Creating an R2 bucket and an API token scoped to it (Cloudflare
   dashboard), and deciding how credentials (`R2_ACCOUNT_ID`,
   `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` or similar)
   are read and validated.
3. Tests against a real or faithfully-faked S3-compatible client, not just
   the current fail-safe placeholder tests.
4. Writing and verifying the local-file migration (see below).
5. Wiring `getStorageProvider()`'s `"r2"` case to construct the real
   provider, and updating this document and `.env.example` accordingly.

None of the above exists yet in this codebase.

## Migrating existing local files (future milestone)

`Upload.location` already stores a provider-agnostic relative key (e.g.
`projects/<uuid>/<filename>`), so no schema change will be needed to switch
providers. Migrating existing files means walking `STORAGE_ROOT` and calling
the real R2 provider's `put(key, buffer)` for each file found, using the same
relative path as the key so every `Upload.location` value already in the
database keeps resolving correctly. That script is intentionally not written
yet — it needs a real, implemented R2 provider and real R2 credentials to
run or test, and belongs in the milestone that actually builds R2 support.

## Testing

`lib/modules/storage/__tests__/` covers both providers via `node --test`
(`npm test`):
- `local-storage-provider.test.ts` — real filesystem round-trip against a
  temp directory, plus a path-traversal check.
- `r2-storage-provider.test.ts` — confirms every method rejects with a clear
  "R2 is not connected/configured" error rather than silently succeeding.
- `get-storage-provider.test.ts` — confirms `STORAGE_DRIVER` selection:
  `local` is the default and can be selected explicitly, `r2` selects the
  placeholder (which fails safely on use), and an unknown driver throws
  instead of silently falling back. Each scenario runs in its own subprocess
  since `getStorageProvider()` memoizes a singleton per process.
