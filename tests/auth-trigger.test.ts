import { afterAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";

/**
 * The auth bridge.
 *
 * Signup creates a row in auth.users, which Supabase owns; our profiles row is
 * created by a trigger. If that trigger ever breaks, every signed-in user gets
 * a foreign key failure on their first action — so it is worth a real
 * end-to-end check against the running Supabase stack.
 */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const createdUserIds: string[] = [];

afterAll(async () => {
  for (const id of createdUserIds) {
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  await db.$disconnect();
});

describe("auth.users → public.profiles trigger", () => {
  it("creates a profile when a user signs up", async () => {
    const email = `trigger-${randomUUID().slice(0, 8)}@vitest.local`;

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: "correct-horse-battery",
      email_confirm: true,
      user_metadata: { name: "Trigger Test" },
    });

    expect(error).toBeNull();
    const userId = data.user!.id;
    createdUserIds.push(userId);

    const profile = await db.profile.findUnique({ where: { id: userId } });
    expect(profile).not.toBeNull();
    expect(profile!.email).toBe(email);
    expect(profile!.name).toBe("Trigger Test");
  });

  it("removes the profile when the auth user is deleted", async () => {
    const email = `cascade-${randomUUID().slice(0, 8)}@vitest.local`;

    const { data } = await admin.auth.admin.createUser({
      email,
      password: "correct-horse-battery",
      email_confirm: true,
    });
    const userId = data.user!.id;

    // A site proves the delete cascades past the profile into app data.
    await db.site.create({
      data: { ownerId: userId, name: "Doomed", subdomain: `doomed-${userId.slice(0, 8)}` },
    });

    await admin.auth.admin.deleteUser(userId);

    expect(await db.profile.findUnique({ where: { id: userId } })).toBeNull();
    expect(await db.site.findFirst({ where: { ownerId: userId } })).toBeNull();
  });
});
