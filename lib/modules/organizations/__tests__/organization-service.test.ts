import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { getOrCreateOrganizationForUser } from "../organization-service";

describe("getOrCreateOrganizationForUser", () => {
  const userIds: string[] = [];
  after(async () => {
    for (const id of userIds) await prisma.user.delete({ where: { id } }).catch(() => {}); // cascades organization
  });

  async function freshUser(name: string) {
    const suffix = randomUUID();
    const user = await prisma.user.create({
      data: { id: `test-user-${suffix}`, name, email: `org-svc-${suffix}@example.com` },
    });
    userIds.push(user.id);
    return user;
  }

  it("creates an organization named after the user on first call", async () => {
    const user = await freshUser("Jane Customer");
    const org = await getOrCreateOrganizationForUser(user.id, user.name);
    assert.equal(org.ownerUserId, user.id);
    assert.equal(org.name, "Jane Customer's Workspace");
  });

  it("is idempotent: a second call for the same user returns the same organization", async () => {
    const user = await freshUser("Repeat Caller");
    const first = await getOrCreateOrganizationForUser(user.id, user.name);
    const second = await getOrCreateOrganizationForUser(user.id, user.name);
    assert.equal(second.id, first.id);

    const count = await prisma.organization.count({ where: { ownerUserId: user.id } });
    assert.equal(count, 1, "must not create a second organization row for the same user");
  });

  it("falls back to a generic name when the user's name is blank", async () => {
    const user = await freshUser("   ");
    const org = await getOrCreateOrganizationForUser(user.id, user.name);
    assert.equal(org.name, "My Workspace");
  });
});
