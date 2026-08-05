# Organizations (Single Organization Ownership)

MR-3.2 (Beta SaaS Build Program, "Customer Workspace Foundation") introduces
tenancy: every customer owns exactly one `Organization`, and every piece of
data they create through the `/dashboard` surface is scoped to it. This is
deliberately the smallest tenancy model that makes the product usable —
one organization per user, no teams, no invitations, no RBAC. See
`docs/MARKET_READINESS_MASTER_PLAN.md`'s Beta SaaS Build Program addendum
(under "MR-4: User, workspace, and tenant authorization") for the original
plan this milestone implements a re-scoped slice of.

## The ownership chain

```
User (1) ──owns──> Organization (1)
                        │
                        ├──owns──> SocialAccount (Instagram account)
                        │               │
                        │               └──owns──> Campaign ──owns──> Keyword
                        │
                        └──denormalized on──> ConversionLog (the matched business event)
```

- **`Organization.ownerUserId`** is `@unique` — the schema itself enforces
  "exactly one organization per user."
- **`SocialAccount.organizationId`** (nullable) is the actual root of
  ownership. `Campaign` and `Keyword` carry **no** `organizationId` column
  of their own — their ownership is already fully implied by the existing
  `Campaign.socialAccountId` → `Keyword.campaignId` chain, so a second
  column there would be a redundant value to keep in sync, not a new
  capability. `lib/modules/organizations/ownership.ts`'s
  `assertCampaignOwnership` enforces this by joining up that chain.
- **`ConversionLog.organizationId`** (nullable) is the one deliberate
  exception: denormalized directly rather than derived by a join, because
  `ConversionLog` is the actual business event this product exists to
  produce and the intended audit/analytics boundary. Set by
  `services/trigger-matcher.ts` at the same moment `campaignId` is set —
  a row that never matches a campaign, or matches a legacy admin-owned
  campaign, simply has no organization.
- **`Lead` is deliberately NOT organization-scoped.** It's a global
  identity table, deduped by `instagramUserId` "across all campaigns" —
  an existing invariant from Milestone 3, not something this milestone is
  authorized to redesign. The same real Instagram user could independently
  interact with two different organizations' campaigns; each organization
  sees only their own interaction history with that person (via their own
  `ConversionLog` rows), never the other organization's. An organization's
  "leads" are reached only through its own `ConversionLog` rows, never a
  direct `Lead.organizationId`.

## Auto-creation on signup

`lib/auth/server.ts`'s `databaseHooks.user.create.after` calls
`getOrCreateOrganizationForUser` right after every customer sign-up.
It's best-effort and non-blocking — a failure here must never fail
sign-up itself, since the `User` row has already committed by the time
this hook runs. `lib/modules/organizations/session.ts`'s
`getCustomerContext()` (called by every `/dashboard` page and
`/api/customer/**` route) self-heals by calling the same idempotent
function if the hook somehow didn't run for a given user, so a customer
is never actually left without an organization.

## Enforcement

Every `/api/customer/**` route and `/dashboard/**` page calls
`getCustomerContext()` first (401/redirect if no session), then, for
anything beyond listing the caller's own resources, calls
`assertSocialAccountOwnership` or `assertCampaignOwnership`
(`lib/modules/organizations/ownership.ts`) before reading or mutating
anything. Both collapse "doesn't exist" and "exists but belongs to a
different organization" into the same `null`/404 outcome — a customer
probing another organization's ids learns nothing, never a distinct
403 that would confirm the id is real. Verified by
`lib/modules/organizations/__tests__/ownership.test.ts` (unit level) and
`test/api/customer-ownership.test.ts` (real HTTP, two real organizations,
every customer route) — see the Testing section below.

## The existing admin surface is unaffected

`/ops` (the `ADMIN_PASSCODE`-gated internal surface) is untouched — same
routes, same behavior, same unscoped queries it always had. Admin-created
`SocialAccount`/`Campaign` rows simply have `organizationId: null` and stay
reachable only through `/ops`, exactly as before this milestone. The two
systems coexist without integration by design: `/ops` is the internal
operator tool this product was originally built as; `/dashboard` is the
new customer-facing surface layered on top.

One file is a deliberate, narrow exception: Meta's app configuration has
exactly one registered OAuth `redirect_uri`, so the customer-facing
Instagram connect flow necessarily lands on the same callback route the
admin flow already used
(`app/api/admin/instagram/callback/route.ts`) — there is nowhere else for
it to go. The route dispatches on which of two distinct, independently
signed state cookies is present; when the customer cookie isn't set, every
line of the admin path runs exactly as it did before this milestone.

## Cross-organization safety on Instagram (re)connect

The real Instagram account owner could, in principle, run the OAuth
consent flow twice under two different organizations — Meta only verifies
they own the Instagram account, not which of our organizations should get
it. The callback route rejects this outright: reconnecting an account
already owned by the initiating organization is a normal token refresh;
touching a `SocialAccount` row owned by a *different* organization (or one
connected via `/ops`) returns `already_connected` and does not touch that
account's live token or webhook subscription.

## Testing

- `lib/modules/organizations/__tests__/organization-service.test.ts` —
  auto-creation, idempotency, name fallback.
- `lib/modules/organizations/__tests__/ownership.test.ts` — unit-level
  cross-organization isolation for both assertion helpers.
- `test/api/customer-ownership.test.ts` — real HTTP against the actual
  built app: two real customers, two real organizations, every
  `/api/customer/**` route proven to 404 (not 403) on the other
  organization's resources, and to leave them unmodified.
- `services/__tests__/trigger-matcher.test.ts` — `ConversionLog`'s
  `organizationId` is stamped correctly on match, and stays `null` for a
  legacy admin-owned campaign.
- `e2e/customer-workspace.spec.ts` — a real browser: sign up, connect
  Instagram (seeded, since real Meta OAuth can't run in CI), create a
  campaign, manage keywords, then a second independent customer signs up
  and sees none of it, in the actual UI, not just the API.
