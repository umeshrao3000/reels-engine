import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// MR-3.2 (Single Organization Ownership): exactly one Organization per
// customer User (ownerUserId is @unique in the schema). Auto-created right
// after sign-up (lib/auth/server.ts's databaseHooks.user.create.after) —
// this function is also called defensively wherever a customer session is
// first used to reach org-scoped data (lib/modules/organizations/session.ts),
// so a user is never left without an organization even if the signup hook
// itself failed to run for any reason.

function organizationNameFor(userName: string): string {
  const trimmed = userName.trim();
  return trimmed ? `${trimmed}'s Workspace` : "My Workspace";
}

/**
 * Idempotent: if the user already has an organization, returns it
 * unchanged. Otherwise creates one. Safe under concurrent callers — a
 * unique-constraint race on ownerUserId (two requests both finding "no
 * organization yet" and both trying to create one) means the loser just
 * re-reads the winner's row instead of erroring.
 */
export async function getOrCreateOrganizationForUser(userId: string, userName: string) {
  const existing = await prisma.organization.findUnique({ where: { ownerUserId: userId } });
  if (existing) return existing;

  try {
    return await prisma.organization.create({
      data: { ownerUserId: userId, name: organizationNameFor(userName) },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return await prisma.organization.findUniqueOrThrow({ where: { ownerUserId: userId } });
    }
    throw err;
  }
}
