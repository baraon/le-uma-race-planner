/** Availability saving and reading, and trimming when an event moves, against a real Postgres. */
import { availabilityRowSchema, groupDetailSchema, type SlotBlock } from '@lmu/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db, Sql } from '../db/client';
import { availability } from '../db/schema';
import { DATABASE_URL, openTestDb, signedInUser, testApp, type TestUser } from '../test-utils';

describe.skipIf(!DATABASE_URL)('availability', () => {
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
    user: TestUser,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    payload?: object,
  ) => app.inject({ method, url, payload, headers: user.headers });

  const race = {
    name: 'Spa 6h',
    startsAt: '2026-11-14T18:00:00.000Z',
    durationMinutes: 360, // 24 slots
  };

  /** Owner, a driver on the team, an admin who may edit availability, and a plain member. */
  async function setup() {
    const owner = await signedInUser(db, 'owner');
    const driver = await signedInUser(db, 'driver');
    const admin = await signedInUser(db, 'admin');
    const bystander = await signedInUser(db, 'bystander');
    const group = groupDetailSchema.parse(
      (await call(owner, 'POST', '/api/groups', { name: 'Availability' })).json(),
    );
    const invite = (
      await call(owner, 'POST', `/api/groups/${group.id}/invites`, {
        expiresInHours: null,
        maxUses: null,
      })
    ).json().token as string;
    for (const u of [driver, admin, bystander]) {
      await call(u, 'POST', `/api/invites/${invite}/accept`);
    }
    await call(owner, 'PUT', `/api/groups/${group.id}/members/${admin.id}/permissions`, {
      manageMembers: false,
      manageTeams: false,
      manageEvents: false,
      manageAvailability: true,
    });
    const team = groupDetailSchema.parse(
      (await call(owner, 'POST', `/api/groups/${group.id}/teams`, { name: 'Hypercar' })).json(),
    ).teams[0]!;
    for (const u of [owner, driver]) await call(u, 'POST', `/api/teams/${team.id}/join`);
    const event = (await call(owner, 'POST', `/api/teams/${team.id}/events`, race)).json();
    return { owner, driver, admin, bystander, eventId: event.id as string };
  }

  const save = (user: TestUser, eventId: string, userId: string, blocks: SlotBlock[]) =>
    call(user, 'PUT', `/api/events/${eventId}/availability/${userId}`, { blocks });

  it('saves a driver’s row as real time ranges and reads it back as slots', async () => {
    const { driver, bystander, eventId } = await setup();
    const blocks: SlotBlock[] = [
      { startSlot: 0, endSlot: 8, status: 'available' },
      { startSlot: 8, endSlot: 12, status: 'maybe' },
      { startSlot: 20, endSlot: 24, status: 'unavailable' },
    ];
    const res = await save(driver, eventId, driver.id, blocks);
    expect(res.statusCode).toBe(200);
    expect(availabilityRowSchema.parse(res.json())).toMatchObject({
      userId: driver.id,
      blocks,
      updatedBy: driver.id,
    });

    const stored = await db
      .select({ period: availability.period })
      .from(availability)
      .where(eq(availability.userId, driver.id));
    expect(stored.map((r) => r.period).sort()).toEqual([
      '["2026-11-14 18:00:00+00","2026-11-14 20:00:00+00")',
      '["2026-11-14 20:00:00+00","2026-11-14 21:00:00+00")',
      '["2026-11-14 23:00:00+00","2026-11-15 00:00:00+00")',
    ]);

    // Every group member can read every row.
    const rows = (await call(bystander, 'GET', `/api/events/${eventId}/availability`)).json();
    expect(rows).toEqual([expect.objectContaining({ userId: driver.id, blocks })]);
  });

  it('replaces the whole row on each save', async () => {
    const { driver, eventId } = await setup();
    await save(driver, eventId, driver.id, [{ startSlot: 0, endSlot: 24, status: 'available' }]);
    const res = await save(driver, eventId, driver.id, [
      { startSlot: 4, endSlot: 6, status: 'maybe' },
    ]);
    expect(res.json().blocks).toEqual([{ startSlot: 4, endSlot: 6, status: 'maybe' }]);
    const cleared = await save(driver, eventId, driver.id, []);
    expect(cleared.json()).toMatchObject({ blocks: [], updatedAt: null });
  });

  it('lets only the driver or an availability admin edit a row', async () => {
    const { owner, driver, admin, bystander, eventId } = await setup();
    const one: SlotBlock[] = [{ startSlot: 0, endSlot: 1, status: 'available' }];

    expect((await save(bystander, eventId, driver.id, one)).statusCode).toBe(403);
    const byAdmin = await save(admin, eventId, driver.id, one);
    expect(byAdmin.statusCode).toBe(200);
    expect(byAdmin.json().updatedBy).toBe(admin.id);
    expect((await save(owner, eventId, driver.id, one)).statusCode).toBe(200);

    // Not on the team: no row, even for an admin or yourself.
    expect((await save(admin, eventId, bystander.id, one)).statusCode).toBe(409);
    expect((await save(bystander, eventId, bystander.id, one)).statusCode).toBe(409);

    const stranger = await signedInUser(db, 'stranger');
    expect((await call(stranger, 'GET', `/api/events/${eventId}/availability`)).statusCode).toBe(
      404,
    );
  });

  it('rejects blocks that overlap or run past the flag', async () => {
    const { driver, eventId } = await setup();
    const bad: SlotBlock[][] = [
      [
        { startSlot: 0, endSlot: 4, status: 'available' },
        { startSlot: 3, endSlot: 6, status: 'maybe' },
      ],
      [{ startSlot: 20, endSlot: 25, status: 'available' }],
      [{ startSlot: 5, endSlot: 5, status: 'available' }],
    ];
    for (const blocks of bad) {
      expect((await save(driver, eventId, driver.id, blocks)).statusCode).toBe(400);
    }
    expect(await db.select().from(availability).where(eq(availability.userId, driver.id))).toEqual(
      [],
    );
  });

  it('counts a final partial slot as ending at the flag', async () => {
    const { owner, driver, eventId } = await setup();
    await call(owner, 'PUT', `/api/events/${eventId}`, { ...race, durationMinutes: 100 }); // 7 slots
    const res = await save(driver, eventId, driver.id, [
      { startSlot: 6, endSlot: 7, status: 'available' },
    ]);
    expect(res.statusCode).toBe(200);
    const [row] = await db
      .select({ period: availability.period })
      .from(availability)
      .where(eq(availability.userId, driver.id));
    expect(row!.period).toBe('["2026-11-14 19:30:00+00","2026-11-14 19:40:00+00")');
  });

  it('keeps real-world times when an event moves, trimming what no longer fits', async () => {
    const { owner, driver, eventId } = await setup();
    // 19:00-21:00 available, 23:00-24:00 maybe (UTC).
    await save(driver, eventId, driver.id, [
      { startSlot: 4, endSlot: 12, status: 'available' },
      { startSlot: 20, endSlot: 24, status: 'maybe' },
    ]);

    // One hour earlier and two hours shorter: 17:00-21:00.
    const moved = await call(owner, 'PUT', `/api/events/${eventId}`, {
      ...race,
      startsAt: '2026-11-14T17:00:00.000Z',
      durationMinutes: 240,
    });
    expect(moved.statusCode).toBe(200);
    const [row] = (await call(driver, 'GET', `/api/events/${eventId}/availability`)).json();
    // Same instants (19:00-21:00) are now slots 8-16; the 23:00 block is gone.
    expect(row.blocks).toEqual([{ startSlot: 8, endSlot: 16, status: 'available' }]);
    expect(row.updatedBy).toBe(driver.id);

    // Moving off the 15-minute grid shrinks blocks to whole slots.
    await call(owner, 'PUT', `/api/events/${eventId}`, {
      ...race,
      startsAt: '2026-11-14T17:05:00.000Z',
      durationMinutes: 240,
    });
    const [after] = (await call(driver, 'GET', `/api/events/${eventId}/availability`)).json();
    // 19:05-20:50 → slots 8 (19:05) to 15 (20:50).
    expect(after.blocks).toEqual([{ startSlot: 8, endSlot: 15, status: 'available' }]);
  });
});
