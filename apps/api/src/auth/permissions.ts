/**
 * Group authorization. Every group-scoped endpoint loads the caller's membership row and checks
 * it here; non-members get 404 (so group IDs don't leak), members without the flag get 403.
 */
import type { GroupRole, Permission, Permissions } from '@lmu/shared';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { groupMembers } from '../db/schema';

export interface Membership {
  role: GroupRole;
  /** Effective permissions: all true for the owner. */
  permissions: Permissions;
}

/** Maps our permission names to the stored flag columns. */
export function storedPermissions(row: typeof groupMembers.$inferSelect): Permissions {
  return {
    manageMembers: row.canManageMembers,
    manageTeams: row.canManageTeams,
    manageEvents: row.canManageEvents,
    manageAvailability: row.canManageAvailability,
  };
}

export function permissionColumns(p: Permissions) {
  return {
    canManageMembers: p.manageMembers,
    canManageTeams: p.manageTeams,
    canManageEvents: p.manageEvents,
    canManageAvailability: p.manageAvailability,
  };
}

export function effectivePermissions(row: typeof groupMembers.$inferSelect): Permissions {
  if (row.role === 'owner') {
    return { manageMembers: true, manageTeams: true, manageEvents: true, manageAvailability: true };
  }
  return storedPermissions(row);
}

export async function getMembership(
  db: Db,
  groupId: string,
  userId: string,
): Promise<Membership | null> {
  const [row] = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
  return row ? { role: row.role, permissions: effectivePermissions(row) } : null;
}

export function can(m: Membership, permission: Permission): boolean {
  return m.permissions[permission];
}
