import { sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { users } from '../db/schema';

export type User = typeof users.$inferSelect;

/** Inserts or refreshes the user from Discord's profile. Only these four fields are kept. */
export async function upsertDiscordUser(
  db: Db,
  profile: {
    discordId: string;
    username: string;
    displayName: string | null;
    avatarHash: string | null;
  },
): Promise<User> {
  const [user] = await db
    .insert(users)
    .values(profile)
    .onConflictDoUpdate({
      target: users.discordId,
      set: {
        username: profile.username,
        displayName: profile.displayName,
        avatarHash: profile.avatarHash,
        updatedAt: sql`now()`,
      },
    })
    .returning();
  return user!;
}
