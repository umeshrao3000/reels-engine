import { headers } from "next/headers";
import type { Organization } from "@prisma/client";
import { auth } from "@/lib/auth/server";
import { getOrCreateOrganizationForUser } from "./organization-service";

// MR-3.2 (Single Organization Ownership): the customer-facing counterpart
// of lib/modules/admin/session.ts's isRequestFromAdmin() — same shape
// (a single shared helper every gated route/page calls), different
// identity system (better-auth session, not the ADMIN_PASSCODE cookie).
// Entirely separate from, and non-interacting with, the admin surface.

type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

export type CustomerContext = { user: Session["user"]; organization: Organization };

/**
 * Reads the current better-auth session and resolves the caller's
 * Organization, self-healing (getOrCreateOrganizationForUser) if the
 * signup hook somehow didn't run for this user. Returns null if there is
 * no session — callers decide how to respond (redirect for pages, 401 JSON
 * for API routes).
 */
export async function getCustomerContext(): Promise<CustomerContext | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const organization = await getOrCreateOrganizationForUser(session.user.id, session.user.name);
  return { user: session.user, organization };
}
