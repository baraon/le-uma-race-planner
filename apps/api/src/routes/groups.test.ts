/** Groups, invites, permissions, teams and events, against a real Postgres. */
import {
  createdInviteSchema,
  eventSchema,
  groupDetailSchema,
  invitePreviewSchema,
  type GroupDetail,
  type Permissions,
} from '@lmu/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db, Sql } from '../db/client';
import { availability, groupInvites } from '../db/schema';
import { DATABASE_URL, openTestDb, signedInUser, testApp, type TestUser } from '../test-utils';

const none: Permissions = {
  manageMembers: false,
  manageTeams: false,
  manageEvents: false,
  manageAvailability: false,
};

describe.skipIf(!DATABASE_URL)('groups, teams and events', () => {
  let sql: Sql;
  let db: Db;
  let app: FastifyInstance;

  beforeAll(async () => {
    ({ sql, db } = await openTestDb());
    app = await testApp(db);
  });

  afterAll(async () => {
    await app?.close();
    await sql?.end({ timeout: 5 });
  });

  const call = (
    user: TestUser | null,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    payload?: object,
  ) => app.inject({ method, url, payload, headers: user?.headers });

  async function createGroup(owner: TestUser, name = 'Night Owls'): Promise<GroupDetail> {
    const res = await call(owner, 'POST', '/api/groups', { name });
    expect(res.statusCode).toBe(201);
    return groupDetailSchema.parse(res.json());
  }

  async function join(user: TestUser, group: GroupDetail, owner: TestUser) {
    const invite = createdInviteSchema.parse(
      (
        await call(owner, 'POST', `/api/groups/${group.id}/invites`, {
          expiresInHours: null,
          maxUses: null,
        })
      ).json(),
    );
    const res = await call(user, 'POST', `/api/invites/${invite.token}/accept`);
    expect(res.statusCode).toBe(200);
  }

  async function grant(
    owner: TestUser,
    group: GroupDetail,
    user: TestUser,
    p: Partial<Permissions>,
  ) {
    const res = await call(owner, 'PUT', `/api/groups/${group.id}/members/${user.id}/permissions`, {
      ...none,
      ...p,
    });
    expect(res.statusCode).toBe(200);
    return groupDetailSchema.parse(res.json());
  }

  it('creates a group with the creator as owner holding every permission', async () => {
    const owner = await signedInUser(db, 'owner');
    const group = await createGroup(owner, 'Night Owls Racing!');

    expect(group).toMatchObject({
      name: 'Night Owls Racing!',
      ownerId: owner.id,
      role: 'owner',
      memberCount: 1,
      permissions: {
        manageMembers: true,
        manageTeams: true,
        manageEvents: true,
        manageAvailability: true,
      },
    });
    expect(group.members).toHaveLength(1);
    expect(group.members[0]).toMatchObject({ role: 'owner', permissions: none });

    // Same name again still works (slug gets a suffix).
    await createGroup(owner, 'Night Owls Racing!');

    const list = await call(owner, 'GET', '/api/groups');
    expect(
      list.json().filter((g: { name: string }) => g.name === 'Night Owls Racing!'),
    ).toHaveLength(2);

    expect((await call(owner, 'POST', '/api/groups', { name: '   ' })).statusCode).toBe(400);
    expect((await call(null, 'GET', '/api/groups')).statusCode).toBe(401);
  });

  it('hides groups from non-members', async () => {
    const owner = await signedInUser(db, 'owner');
    const stranger = await signedInUser(db, 'stranger');
    const group = await createGroup(owner);

    for (const url of [
      `/api/groups/${group.id}`,
      `/api/groups/${group.id}/events`,
      `/api/groups/${group.id}/invites`,
      '/api/groups/not-a-uuid',
    ]) {
      expect((await call(stranger, 'GET', url)).statusCode, url).toBe(404);
    }
    expect(
      (await call(stranger, 'POST', `/api/groups/${group.id}/teams`, { name: 'X' })).statusCode,
    ).toBe(404);
  });

  it('joins through an invite link, respecting max uses, expiry and revocation', async () => {
    const owner = await signedInUser(db, 'owner');
    const driver = await signedInUser(db, 'driver');
    const late = await signedInUser(db, 'late');
    const group = await createGroup(owner);

    const res = await call(owner, 'POST', `/api/groups/${group.id}/invites`, {
      expiresInHours: 24,
      maxUses: 1,
    });
    expect(res.statusCode).toBe(201);
    const invite = createdInviteSchema.parse(res.json());

    const preview = invitePreviewSchema.parse(
      (await call(driver, 'GET', `/api/invites/${invite.token}`)).json(),
    );
    expect(preview).toEqual({
      groupId: group.id,
      groupName: 'Night Owls',
      memberCount: 1,
      alreadyMember: false,
    });

    expect((await call(driver, 'POST', `/api/invites/${invite.token}/accept`)).json()).toEqual({
      groupId: group.id,
    });
    // Accepting again is harmless and doesn't spend a use.
    expect((await call(driver, 'POST', `/api/invites/${invite.token}/accept`)).statusCode).toBe(
      200,
    );
    expect((await call(late, 'POST', `/api/invites/${invite.token}/accept`)).statusCode).toBe(410);

    const detail = groupDetailSchema.parse(
      (await call(owner, 'GET', `/api/groups/${group.id}`)).json(),
    );
    expect(detail.members.map((m) => m.user.id)).toEqual([owner.id, driver.id]);

    // Only the token's hash is stored.
    const [stored] = await db.select().from(groupInvites).where(eq(groupInvites.id, invite.id));
    expect(stored!.tokenHash).not.toBe(invite.token);
    expect(stored!.useCount).toBe(1);

    // Expired.
    const expiring = createdInviteSchema.parse(
      (
        await call(owner, 'POST', `/api/groups/${group.id}/invites`, {
          expiresInHours: 1,
          maxUses: null,
        })
      ).json(),
    );
    await db
      .update(groupInvites)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(groupInvites.id, expiring.id));
    expect((await call(late, 'GET', `/api/invites/${expiring.token}`)).statusCode).toBe(410);
    expect((await call(late, 'POST', `/api/invites/${expiring.token}/accept`)).statusCode).toBe(
      410,
    );

    // Revoked.
    const revoked = createdInviteSchema.parse(
      (
        await call(owner, 'POST', `/api/groups/${group.id}/invites`, {
          expiresInHours: null,
          maxUses: null,
        })
      ).json(),
    );
    expect(
      (await call(owner, 'DELETE', `/api/groups/${group.id}/invites/${revoked.id}`)).statusCode,
    ).toBe(204);
    expect((await call(late, 'POST', `/api/invites/${revoked.token}/accept`)).statusCode).toBe(404);
    expect((await call(late, 'GET', '/api/invites/garbage')).statusCode).toBe(404);

    // Plain members can't make or see invites.
    expect(
      (
        await call(driver, 'POST', `/api/groups/${group.id}/invites`, {
          expiresInHours: null,
          maxUses: null,
        })
      ).statusCode,
    ).toBe(403);
    expect((await call(driver, 'GET', `/api/groups/${group.id}/invites`)).statusCode).toBe(403);
    const invites = await call(owner, 'GET', `/api/groups/${group.id}/invites`);
    expect(invites.json()).toHaveLength(2);
    expect(JSON.stringify(invites.json())).not.toContain(invite.token);
  });

  it('lets only the owner grant and revoke admin permissions', async () => {
    const owner = await signedInUser(db, 'owner');
    const admin = await signedInUser(db, 'admin');
    const driver = await signedInUser(db, 'driver');
    const group = await createGroup(owner);
    await join(admin, group, owner);
    await join(driver, group, owner);

    const after = await grant(owner, group, admin, { manageTeams: true, manageMembers: true });
    expect(after.members.find((m) => m.user.id === admin.id)).toMatchObject({
      role: 'admin',
      permissions: { ...none, manageTeams: true, manageMembers: true },
    });

    const asAdmin = groupDetailSchema.parse(
      (await call(admin, 'GET', `/api/groups/${group.id}`)).json(),
    );
    expect(asAdmin).toMatchObject({
      role: 'admin',
      permissions: { manageTeams: true, manageEvents: false },
    });

    // Admins can't hand out permissions, and nobody can change the owner.
    expect(
      (
        await call(admin, 'PUT', `/api/groups/${group.id}/members/${driver.id}/permissions`, {
          ...none,
          manageEvents: true,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await call(owner, 'PUT', `/api/groups/${group.id}/members/${owner.id}/permissions`, none))
        .statusCode,
    ).toBe(409);
    expect(
      (
        await call(owner, 'PUT', `/api/groups/${group.id}/members/${driver.id}/permissions`, {
          manageTeams: true,
        })
      ).statusCode,
    ).toBe(400);

    const revoked = await grant(owner, group, admin, {});
    expect(revoked.members.find((m) => m.user.id === admin.id)?.role).toBe('member');
  });

  it('removes members: managers remove drivers, only the owner removes admins', async () => {
    const owner = await signedInUser(db, 'owner');
    const manager = await signedInUser(db, 'manager');
    const otherAdmin = await signedInUser(db, 'other-admin');
    const driver = await signedInUser(db, 'driver');
    const group = await createGroup(owner);
    for (const u of [manager, otherAdmin, driver]) await join(u, group, owner);
    await grant(owner, group, manager, { manageMembers: true });
    await grant(owner, group, otherAdmin, { manageEvents: true });

    const remove = (by: TestUser, who: TestUser) =>
      call(by, 'DELETE', `/api/groups/${group.id}/members/${who.id}`);
    expect((await remove(driver, otherAdmin)).statusCode).toBe(403);
    expect((await remove(manager, otherAdmin)).statusCode).toBe(403);
    expect((await remove(manager, owner)).statusCode).toBe(403);
    expect((await remove(manager, manager)).statusCode).toBe(409);
    expect((await remove(manager, driver)).statusCode).toBe(204);
    expect((await remove(owner, otherAdmin)).statusCode).toBe(204);

    // The owner can't leave; others can.
    expect((await call(owner, 'POST', `/api/groups/${group.id}/leave`)).statusCode).toBe(409);
    expect((await call(manager, 'POST', `/api/groups/${group.id}/leave`)).statusCode).toBe(204);
    expect((await call(manager, 'GET', `/api/groups/${group.id}`)).statusCode).toBe(404);

    expect((await call(owner, 'GET', `/api/groups/${group.id}`)).json().memberCount).toBe(1);
  });

  it('manages teams; drivers join and leave them themselves', async () => {
    const owner = await signedInUser(db, 'owner');
    const driver = await signedInUser(db, 'driver');
    const group = await createGroup(owner);
    await join(driver, group, owner);

    expect(
      (await call(driver, 'POST', `/api/groups/${group.id}/teams`, { name: 'LMP2' })).statusCode,
    ).toBe(403);
    const created = groupDetailSchema.parse(
      (await call(owner, 'POST', `/api/groups/${group.id}/teams`, { name: 'Hypercar #7' })).json(),
    );
    const team = created.teams[0]!;
    expect(team).toMatchObject({ name: 'Hypercar #7', memberIds: [] });
    expect(
      (await call(owner, 'POST', `/api/groups/${group.id}/teams`, { name: 'Hypercar #7' }))
        .statusCode,
    ).toBe(409);

    const joined = groupDetailSchema.parse(
      (await call(driver, 'POST', `/api/teams/${team.id}/join`)).json(),
    );
    expect(joined.teams[0]!.memberIds).toEqual([driver.id]);
    expect((await call(driver, 'POST', `/api/teams/${team.id}/join`)).statusCode).toBe(200);

    const renamed = await call(owner, 'PATCH', `/api/teams/${team.id}`, { name: 'Hypercar #8' });
    expect(renamed.json().teams[0].name).toBe('Hypercar #8');
    expect(
      (await call(driver, 'PATCH', `/api/teams/${team.id}`, { name: 'Mine' })).statusCode,
    ).toBe(403);

    const left = groupDetailSchema.parse(
      (await call(driver, 'POST', `/api/teams/${team.id}/leave`)).json(),
    );
    expect(left.teams[0]!.memberIds).toEqual([]);

    // Leaving the group also takes you off its teams.
    await call(driver, 'POST', `/api/teams/${team.id}/join`);
    await call(driver, 'POST', `/api/groups/${group.id}/leave`);
    const afterLeave = groupDetailSchema.parse(
      (await call(owner, 'GET', `/api/groups/${group.id}`)).json(),
    );
    expect(afterLeave.teams[0]!.memberIds).toEqual([]);

    // Strangers can't see or join the team.
    const stranger = await signedInUser(db, 'stranger');
    expect((await call(stranger, 'POST', `/api/teams/${team.id}/join`)).statusCode).toBe(404);

    expect((await call(owner, 'DELETE', `/api/teams/${team.id}`)).statusCode).toBe(204);
  });

  it('creates events that every member sees, as UTC instants', async () => {
    const owner = await signedInUser(db, 'owner');
    const planner = await signedInUser(db, 'planner');
    const driver = await signedInUser(db, 'driver');
    const stranger = await signedInUser(db, 'stranger');
    const group = await createGroup(owner);
    await join(planner, group, owner);
    await join(driver, group, owner);
    await grant(owner, group, planner, { manageEvents: true });
    const team = groupDetailSchema.parse(
      (await call(owner, 'POST', `/api/groups/${group.id}/teams`, { name: 'Hypercar' })).json(),
    ).teams[0]!;

    const startsAt = new Date(Date.now() + 7 * 24 * 3_600_000);
    startsAt.setUTCSeconds(0, 0);
    const input = {
      name: '6 Hours of Spa',
      startsAt: startsAt.toISOString(),
      durationMinutes: 360,
      track: 'Spa-Francorchamps',
      carClass: '',
      trackTimezone: 'Europe/Brussels',
    };

    expect((await call(driver, 'POST', `/api/teams/${team.id}/events`, input)).statusCode).toBe(
      403,
    );
    const res = await call(planner, 'POST', `/api/teams/${team.id}/events`, input);
    expect(res.statusCode).toBe(201);
    const event = eventSchema.parse(res.json());
    expect(event).toMatchObject({
      teamId: team.id,
      teamName: 'Hypercar',
      groupName: 'Night Owls',
      startsAt: startsAt.toISOString(),
      carClass: null,
      trackTimezone: 'Europe/Brussels',
    });

    const upcoming = await call(driver, 'GET', '/api/events/upcoming');
    expect(upcoming.json().map((e: { id: string }) => e.id)).toContain(event.id);
    expect((await call(driver, 'GET', `/api/events/${event.id}`)).json().name).toBe(
      '6 Hours of Spa',
    );
    expect((await call(driver, 'GET', `/api/groups/${group.id}/events`)).json()).toHaveLength(1);
    expect((await call(stranger, 'GET', `/api/events/${event.id}`)).statusCode).toBe(404);
    expect((await call(stranger, 'GET', '/api/events/upcoming')).json()).toEqual([]);

    for (const bad of [
      { ...input, startsAt: '2026-11-14T18:00' }, // no zone: ambiguous
      { ...input, startsAt: '2026-11-14T18:00:00-05:00' }, // offsets: send UTC
      { ...input, durationMinutes: 10 },
      { ...input, trackTimezone: 'UTC+1' },
      { ...input, teamId: team.id },
    ]) {
      expect((await call(planner, 'POST', `/api/teams/${team.id}/events`, bad)).statusCode).toBe(
        400,
      );
    }

    const moved = await call(planner, 'PUT', `/api/events/${event.id}`, {
      ...input,
      durationMinutes: 240,
    });
    expect(moved.json().durationMinutes).toBe(240);
    expect((await call(driver, 'PUT', `/api/events/${event.id}`, input)).statusCode).toBe(403);

    // A finished event drops out of "upcoming".
    const past = await call(planner, 'POST', `/api/teams/${team.id}/events`, {
      ...input,
      name: 'Last week',
      startsAt: new Date(Date.now() - 7 * 24 * 3_600_000).toISOString(),
    });
    expect(past.statusCode).toBe(201);
    const ids = (await call(driver, 'GET', '/api/events/upcoming'))
      .json()
      .map((e: { id: string }) => e.id);
    expect(ids).not.toContain(past.json().id);

    expect((await call(planner, 'DELETE', `/api/events/${event.id}`)).statusCode).toBe(204);
    expect((await call(driver, 'GET', `/api/events/${event.id}`)).statusCode).toBe(404);
  });

  it('refuses event edits that would strand saved availability', async () => {
    const owner = await signedInUser(db, 'owner');
    const group = await createGroup(owner);
    const team = groupDetailSchema.parse(
      (await call(owner, 'POST', `/api/groups/${group.id}/teams`, { name: 'T' })).json(),
    ).teams[0]!;
    const input = {
      name: 'Sebring 12h',
      startsAt: '2027-03-20T15:00:00.000Z',
      durationMinutes: 720,
    };
    const event = eventSchema.parse(
      (await call(owner, 'POST', `/api/teams/${team.id}/events`, input)).json(),
    );
    await db.insert(availability).values({
      eventId: event.id,
      userId: owner.id,
      period: '[2027-03-21 01:00:00+00,2027-03-21 03:00:00+00)',
      status: 'available',
    });

    const shorter = await call(owner, 'PUT', `/api/events/${event.id}`, {
      ...input,
      durationMinutes: 360,
    });
    expect(shorter.statusCode).toBe(409);
    const offGrid = await call(owner, 'PUT', `/api/events/${event.id}`, {
      ...input,
      startsAt: '2027-03-20T15:05:00.000Z',
    });
    expect(offGrid.statusCode).toBe(409);
    // Renaming is fine.
    expect(
      (await call(owner, 'PUT', `/api/events/${event.id}`, { ...input, name: 'Sebring' }))
        .statusCode,
    ).toBe(200);
  });

  it('lets only the owner delete a group', async () => {
    const owner = await signedInUser(db, 'owner');
    const driver = await signedInUser(db, 'driver');
    const group = await createGroup(owner);
    await join(driver, group, owner);
    expect((await call(driver, 'DELETE', `/api/groups/${group.id}`)).statusCode).toBe(403);
    expect((await call(owner, 'DELETE', `/api/groups/${group.id}`)).statusCode).toBe(204);
    expect((await call(driver, 'GET', `/api/groups/${group.id}`)).statusCode).toBe(404);
  });
});
