# Validation Checklist

Every API route, what it validates, and what changed in M7. Verified by direct code review of the current source tree.

| Route | Validates | M7 change |
|---|---|---|
| `POST /api/projects` | File XOR link (not both), file size ≤ 500MB, URL is parseable `http(s)://` | Added rate limit (20/10min per IP) |
| `POST /api/projects/[id]/payments` | Project exists, UTR length 4–40 chars, blocks duplicate submission if a payment is already `PENDING_VERIFICATION`/`PAID` | Added rate limit (10/10min per IP) |
| `POST /api/admin/login` | Passcode is a non-empty string, timing-safe compare against `ADMIN_PASSCODE` | Added rate limit + lockout (5/15min per IP, applies even to a correct passcode once triggered) |
| `PATCH /api/admin/payments/[id]` | Admin session required, `action` is `verify`/`reject`, payment exists, payment not already resolved (409 otherwise) | No change — already complete |
| `PATCH /api/admin/projects/[id]` | Admin session required, project exists, status transition is exactly one legal step forward (409 otherwise) | **Added:** length caps — `assignedEditor` ≤ 100 chars, `internalNotes`/`editorNotes` ≤ 5,000 chars each (previously unbounded) |
| `POST /api/admin/projects/[id]/uploads` | Admin session required, project exists, file present, file size ≤ 500MB | No change — already complete |
| `GET /api/storage/[...key]` | Admin session required (401 otherwise); `LocalStorageAdapter.resolvePath` strips `../` path-traversal segments before touching the filesystem | No change — already complete (locked down in M5) |
| `GET /api/deliver/[token]/[uploadId]` | `shareToken` resolves to a real project, upload belongs to that exact project and is `kind: PROCESSED` (404 otherwise — cross-project isolation) | No change — already complete |
| `POST /api/payments/razorpay/orders` | Fails closed with 503 if Razorpay env vars are unconfigured (the current default state everywhere) | No change |
| `POST /api/payments/razorpay/webhook` | HMAC-SHA256 signature verified against the raw body, timing-safe compare; fails closed if the webhook secret isn't configured | No change |

## Gaps found, not fixed

None outside what's listed under "M7 change" above. Every route already validates its actual inputs before touching the database; the only real gap this pass found was the unbounded editor/notes text fields, which is now closed.
