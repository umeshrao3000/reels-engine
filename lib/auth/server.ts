import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/prisma";
import { getEmailProvider } from "@/lib/modules/email";
import { logger } from "@/lib/logger";
import { getOrCreateOrganizationForUser } from "@/lib/modules/organizations/organization-service";

// MR-3.1 (Beta SaaS Build Program): customer authentication, built on
// better-auth rather than hand-rolled — Product-Owner-approved departure
// from this repo's usual "no SDK dependency" convention (used elsewhere
// for HMAC sessions/AES-GCM/Razorpay), because rolling password hashing,
// reset-token entropy, and session-fixation defenses by hand for a
// paying-customer auth system is real risk a mature, maintained library
// is better positioned to carry. Entirely separate from the admin/ops
// passcode gate (lib/modules/admin/session.ts) — this file does not
// touch that system, and vice versa.
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  // Prisma's own @default(cuid()) generates ids (see prisma/schema.prisma);
  // better-auth must not generate its own, or the two would disagree.
  advanced: {
    database: { generateId: false },
  },
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    // Email verification is explicitly deferred (Product Owner decision,
    // MR-3.1) — accounts are usable immediately after sign-up. Revisit
    // once a real EmailProvider exists; do not set this to true until
    // then, or new customers would be locked out with no way to receive
    // a verification email.
    requireEmailVerification: false,
    async sendResetPassword({ user, url }) {
      await getEmailProvider().sendPasswordReset({ to: user.email, url });
    },
  },
  // MR-3.2 (Single Organization Ownership): every customer gets exactly
  // one Organization, created right after their User row is. Best-effort
  // and non-blocking — a failure here must never fail sign-up itself
  // (the user row already committed by the time this runs); if it does
  // fail, lib/modules/organizations/session.ts's getCustomerContext()
  // self-heals by creating the missing organization on the customer's
  // first authenticated request instead.
  databaseHooks: {
    user: {
      create: {
        async after(user) {
          try {
            await getOrCreateOrganizationForUser(user.id, user.name);
          } catch (err) {
            logger.error("organization.auto_create_failed", {
              userId: user.id,
              error: err instanceof Error ? err.message : "Unknown error",
            });
          }
        },
      },
    },
  },
  plugins: [nextCookies()],
});
