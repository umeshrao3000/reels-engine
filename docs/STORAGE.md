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
| `R2StorageProvider` | `r2-storage-provider.ts` | Implemented against Cloudflare R2's S3-compatible API (via `@aws-sdk/client-s3`), but **not connected** — no bucket, credentials, or API keys exist for it yet. Covered by tests using a fake S3 client; no test in this codebase makes a real network call to R2. |

Selection is by `STORAGE_DRIVER` (`getStorageProvider()`), defaulting to
`"local"`. Nothing else needs to change to add a third provider — implement
`StorageProvider`, add one `case` to the switch.

## Turning on R2 (future milestone — not done yet)

This is deliberately deferred to its own milestone per product direction, so
that this abstraction PR carries zero cloud-provisioning risk. When that
milestone happens, connecting R2 is expected to be config-only:

1. Create an R2 bucket and an API token scoped to it (Cloudflare dashboard).
2. Set in the deployment environment (e.g. Vercel project env vars):
   `STORAGE_DRIVER=r2`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`.
3. Migrate existing local files (see below).
4. Deploy. No application code changes — `getStorageProvider()` already
   returns an `R2StorageProvider` once `STORAGE_DRIVER=r2` is set, and every
   caller already only depends on the interface.

## Migrating existing local files (future milestone)

`Upload.location` already stores a provider-agnostic relative key (e.g.
`projects/<uuid>/<filename>`), so no schema change is needed to switch
providers. Migrating existing files means walking `STORAGE_ROOT` and calling
`R2StorageProvider.put(key, buffer)` for each file found, using the same
relative path as the key so every `Upload.location` value already in the
database keeps resolving correctly. That script is intentionally not written
in this milestone (it would need real R2 credentials to run or test) — it
belongs in the milestone that actually connects R2, so it can be verified
end-to-end at build time instead of committed unverified.

## Testing

`lib/modules/storage/__tests__/` covers both providers via `node --test`
(`npm test`):
- `local-storage-provider.test.ts` — real filesystem round-trip against a
  temp directory, plus a path-traversal check.
- `r2-storage-provider.test.ts` — logic only, against a fake S3-compatible
  client (`put`/`get`/`head`/`delete`) and a real signed-URL computation
  (`getSignedUrl` is pure local signing, no HTTP request) with placeholder
  credentials. No test here talks to Cloudflare.
