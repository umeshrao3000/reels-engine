# Email Provider

All outbound transactional email goes through `EmailProvider`
(`lib/modules/email/types.ts`). Callers — today, only
`lib/auth/server.ts`'s `sendResetPassword` callback — only ever call
`getEmailProvider()` (`lib/modules/email/index.ts`); none of them import an
email SDK/API directly, and none of them know which concrete provider is
active. Exactly the same pattern as `lib/modules/storage` — see
`docs/STORAGE.md`.

```ts
interface EmailProvider {
  sendPasswordReset(email: { to: string; url: string }): Promise<void>;
}
```

## Providers

| Provider | File | Status |
|---|---|---|
| `NoOpEmailProvider` | `noop-provider.ts` | **Active default, and the only implemented provider.** Accepts every request without throwing — password reset must fail gracefully with no email provider configured, not 500 — but never actually sends anything. Logs that a reset was requested (email address only) at `warn` level; deliberately does **not** log the reset URL/token itself, since that's a live credential and writing it to server logs would be its own security regression, not an acceptable side effect of not having email yet. |

Selection is by `EMAIL_PROVIDER` (`getEmailProvider()`), defaulting to
`"noop"`. Adding a real provider later means adding one case to the
switch in `lib/modules/email/index.ts` — callers never change.

## The practical consequence, stated plainly

**Until a real provider replaces `NoOpEmailProvider`, a customer who
requests a password reset will never receive one.** The request succeeds
(no error, no information leak about whether the email exists), but no
email is ever delivered. This is a deliberate, Product-Owner-approved
scope boundary for MR-3.1 (Beta SaaS Build Program) — not an oversight —
so that customer authentication could ship without also deciding on and
paying for an email vendor in the same PR. It must be closed before real
paying customers rely on self-service password reset; tracked as the
single remaining requirement in `docs/MARKET_READINESS_MASTER_PLAN.md`
and `docs/MARKET_READINESS_CHECKLIST.md`.

Email verification (`emailAndPassword.requireEmailVerification` /
`emailVerification.sendVerificationEmail` in `lib/auth/server.ts`) is not
wired to this abstraction at all yet — it's fully deferred, not partially
built. Extending `EmailProvider` with a `sendVerificationEmail` method is
straightforward once a real provider exists to justify it.

## Implementing a real provider (future milestone — not started)

Deliberately deferred so this milestone adds zero SMTP/API-vendor
dependency and zero credential-management surface. When that milestone
happens, expect it to involve:

1. Choosing a transactional email vendor (e.g. Resend, Postmark) and
   adding its SDK (or a plain `fetch` call, consistent with this repo's
   existing no-SDK preference for Razorpay/Meta) as this codebase's one
   new dependency for that milestone.
2. Implementing `sendPasswordReset` (and, if email verification is
   enabled at that point, `sendVerificationEmail`) against that vendor's
   API, with credentials read from a new one-secret-per-concern env var
   (e.g. `RESEND_API_KEY`), following the exact pattern already used for
   `TOKEN_ENCRYPTION_KEY`/`CRON_SECRET`/etc.
3. Wiring `getEmailProvider()`'s new case, and updating this document,
   `.env.example`, and the `EMAIL_PROVIDER` default accordingly.
4. Tests against the vendor's sandbox/test mode, not just the current
   fail-safe no-op tests.

None of the above exists yet in this codebase.

## Testing

`lib/modules/email/__tests__/noop-provider.test.ts` confirms
`NoOpEmailProvider.sendPasswordReset` never throws and never logs the
reset URL/token, only the recipient address.
