# Product Boundary Decision

**Status:** Locked for Phase 0 and all subsequent MR milestones. Changing any decision in this document requires explicit Product Owner / Chief Architect sign-off, not an implementation-time judgment call.
**Grounded in:** `docs/MARKET_READINESS_BASELINE.md` (evidence). This document makes decisions; the baseline documents facts.

---

## 1. Primary launch product

**Instagram comment-automation is the primary product.** The company is launching a SaaS beta that lets a customer connect their own Instagram account, define keyword-triggered campaigns, and have the product automatically send a private DM and public reply when a comment matches — the pipeline that already exists and works (`services/webhook-handler.ts` → `trigger-matcher.ts` → `private-reply.ts` → `public-reply.ts` → `conversion-finalizer.ts`, orchestrated by `pipeline-orchestrator.ts`).

Every future milestone (MR-1 through MR-9) exists to take this pipeline from "an admin-only internal tool one operator drives by hand" to "a product real, distinct customers can sign up for, configure themselves, and trust with their Instagram account." Milestones that do not visibly move the automation product toward that state are out of scope for this plan, full stop.

## 2. Legacy Reel Makeover — status

**Legacy. Not deleted. Not the launch product. Not actively invested in.**

- The upload/pay/deliver flow (`Project`, `Payment`, `Upload`, `Revision` models and everything built on them) stays exactly as-is through Phase 0 and is not to be broken by any MR milestone unless a milestone explicitly says so.
- It is not the thing being marketed at launch. The landing page's current framing — hero copy entirely about "professionally remake your Instagram Reels," `<title>` metadata reading "Professional Reel Makeovers" (`app/layout.tsx:16`) — is the **wrong public face for the launch product** and is corrected under MR-6, not before.
- No further feature investment in the Reel Makeover product is planned under this roadmap. It may continue operating for existing/legacy use; it is not a candidate for the multi-tenant SaaS beta boundary defined below.
- Razorpay scaffolding stays unwired and untouched; Owner Test Mode stays as an internal QA flag, unchanged, not exposed to any real customer.

## 3. Minimal multi-tenant SaaS beta boundary

The launch product is a **minimal multi-tenant beta**, not an enterprise platform. "Minimal" is a hard boundary, not an aspiration — it means exactly this, no more:

**In scope for the beta:**
- One customer = one workspace = one connected Instagram account = the campaigns/keywords/leads/conversion history belonging to that workspace and no other.
- Customer signs up, authenticates, connects Instagram via the existing OAuth flow (already built — `lib/modules/meta/instagram-oauth.ts`), creates campaigns and keywords using the existing Campaign/Keyword Management UI (already built), and can see their own automation activity (a customer-scoped view derived from the existing Monitoring/Dashboard queries, re-scoped to their workspace).
- One internal super-admin role that can see across all workspaces for support purposes, replacing today's single-shared-passcode "see everything" admin model.
- A functioning, verified paid-plan gate before a workspace can run live automation (MR-7) — genuinely verified, not merely present in code.

**Explicitly out of scope for the beta** (deferred, not forgotten — see §5):
- Multiple team members per workspace, seats, or any role beyond "workspace owner" and "internal super-admin."
- Any plan tier beyond what's needed to prove billing works (a single paid plan is sufficient for beta).
- White-labeling, custom domains, or reseller/agency features.
- Multiple Instagram accounts per workspace.
- Any AI-assisted features, analytics dashboards, or reporting beyond what Monitoring already surfaces.
- Public API access for customers.
- Mobile apps.

## 4. Customer workspace vs. internal operations boundary

Two audiences, two surfaces, to be structurally separated (not just visually) by the time of launch:

| | Public marketing site | Customer workspace | Internal operations (`/ops`) |
|---|---|---|---|
| Audience | Prospective customers, anonymous | Signed-up, authenticated customers | Company staff only |
| Purpose | Explain and sell the automation product (MR-6) | Let a customer run their own automation (MR-5) | Support, monitoring, and admin tasks across all workspaces (evolves from today's `/ops`) |
| Auth | None | Real customer authentication (MR-4) | Real internal-staff authentication (MR-4), not today's single shared passcode |
| Data visible | None (no live data) | That customer's workspace only | All workspaces, for support purposes |

Today, `/ops` conflates all three: it is simultaneously "the only way anything gets configured," "the only way anyone monitors anything," and "reachable by three buttons on the public landing page that just demand a password." That conflation is itself a launch blocker addressed by MR-4/MR-5, not a stylistic preference.

## 5. Explicitly deferred capabilities

These are real, named exclusions — not silently dropped, not implied. Anyone proposing to build one of these before MR-9 completes must get explicit sign-off first:

- Team seats / multi-user workspaces.
- Multiple Instagram accounts per workspace.
- White-labeling / custom domains / reseller tooling.
- Public customer-facing API.
- Mobile apps.
- AI-assisted keyword suggestions, sentiment analysis, or any AI feature (explicitly out of scope per the Locked Product Direction's "no unsupported Meta, security, privacy, or performance claims" rule — no AI feature ships without a genuinely built and verified capability behind it).
- Analytics/reporting beyond what Monitoring (MR-3/MR-8 hardening aside) already provides.
- Distributed rate limiting infrastructure beyond what MR-8 scopes as the minimum needed for a real multi-instance deployment.
- Any second storage provider beyond local + R2.
- Any payment gateway beyond what MR-7 needs to prove billing works for a single plan tier.

## 6. Rules preventing future scope drift

1. **No milestone may add a customer-facing capability that isn't in the "in scope" list in §3** without this document being updated and re-approved first.
2. **No milestone may claim a security, privacy, performance, or Meta-compliance property that hasn't been verified against real evidence** (a real Meta test account, a real load test, a real accessibility scan) — matching the Locked Product Direction's explicit rule against unsupported claims. "The code looks like it should work" is not verification.
3. **MR-9 is the only milestone permitted to recommend a launch decision.** No earlier milestone's completion implies launch-readiness, no matter how much of the checklist it closes.
4. **The legacy Reel Makeover product is not to be deleted, redesigned, or functionally changed** by any MR milestone unless a future decision explicitly amends this document to authorize it.
5. **"Minimal" beats "complete."** When a milestone's scope is ambiguous, the smaller, more deferred-heavy interpretation wins, consistent with the Fixed Final Goal: this is a launch plan, not a feature-expansion or beautification exercise.
6. **Every milestone's Definition of Completion must be independently checkable** (a command that runs, a page that loads with real data, a test that passes) — not a narrative claim.
