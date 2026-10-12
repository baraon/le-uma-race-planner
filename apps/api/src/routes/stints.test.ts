/** Stint plans, against a real Postgres. */
import { groupDetailSchema, stintSchema } from '@le-uma/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Db, Sql } from '../db/client';
import { DATABASE_URL, openTestDb, signedInUser, testApp, type TestUser } from '../test-utils';

describe.skipIf(!DATABASE_URL)('stint plans', () => {
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

  const call = (user: TestUser, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: user.headers });

  const stint = (driverId: string | null, extra: Partial<z.infer<typeof stintSchema>> = {}) => ({
    driverId,
    spotterId: null,
    lapsOverride: null,
    lapMsOverride: null,
    extraPitSeconds: 0,
    notes: null,
    ...extra,
  });

  async function setup() {
    const owner = await signedInUser(db, 'owner');
    const driver = await signedInUser(db, 'driver');
    const spotter = await signedInUser(db, 'spotter');
    const group = groupDetailSchema.parse(
      (await call(owner, 'POST', '/api/groups', { name: 'Stints' })).json(),
    );
    const token = (
      await call(owner, 'POST', `/api/groups/${group.id}/invites`, {
        expiresInHours: null,
        maxUses: null,
      })
    ).json().token as string;
    for (const u of [driver, spotter]) await call(u, 'POST', `/api/invites/${token}/accept`);
    const team = groupDetailSchema.parse(
      (await call(owner, 'POST', `/api/groups/${group.id}/teams`, { name: 'GT3' })).json(),
    ).teams[0]!;
    for (const u of [owner, driver]) await call(u, 'POST', `/api/teams/${team.id}/join`);
    const event = (
      await call(owner, 'POST', `/api/teams/${team.id}/events`, {
        name: '24h',
        startsAt: '2027-06-12T14:00:00.000Z',
        durationMinutes: 1440,
      })
    ).json();
    return { owner, driver, spotter, eventId: event.id as string };
  }

  it('saves and replaces the whole plan, in order', async () => {
    const { owner, driver, spotter, eventId } = await setup();
    expect((await call(driver, 'GET', `/api/events/${eventId}/stints`)).json()).toEqual([]);

    const plan = [
      stint(owner.id, { spotterId: spotter.id, notes: '  start, careful T1  ' }),
      stint(driver.id, { lapsOverride: 9, lapMsOverride: 241_500, extraPitSeconds: 25 }),
      stint(null),
    ];
    const res = await call(owner, 'PUT', `/api/events/${eventId}/stints`, { stints: plan });
    expect(res.statusCode).toBe(200);
    expect(z.array(stintSchema).parse(res.json())).toEqual([
      { ...plan[0], notes: 'start, careful T1' },
      plan[1],
      plan[2],
    ]);

    // Replacing with a shorter plan drops the rest; members can read it.
    await call(owner, 'PUT', `/api/events/${eventId}/stints`, { stints: [stint(driver.id)] });
    expect((await call(driver, 'GET', `/api/events/${eventId}/stints`)).json()).toEqual([
      stint(driver.id),
    ]);
  });

  it('lets only event managers save, with drivers from the team and spotters from the group', async () => {
    const { owner, driver, spotter, eventId } = await setup();
    expect(
      (await call(driver, 'PUT', `/api/events/${eventId}/stints`, { stints: [] })).statusCode,
    ).toBe(403);
    // Spotter isn't on the team: can spot, can't drive.
    const asDriver = await call(owner, 'PUT', `/api/events/${eventId}/stints`, {
      stints: [stint(spotter.id)],
    });
    expect(asDriver.statusCode).toBe(400);
    const stranger = await signedInUser(db, 'stranger');
    const strangerSpot = await call(owner, 'PUT', `/api/events/${eventId}/stints`, {
      stints: [stint(driver.id, { spotterId: stranger.id })],
    });
    expect(strangerSpot.statusCode).toBe(400);
    expect((await call(stranger, 'GET', `/api/events/${eventId}/stints`)).statusCode).toBe(404);
    for (const bad of [
      { stints: [stint(driver.id, { lapsOverride: 0 })] },
      { stints: [stint(driver.id, { extraPitSeconds: -5 })] },
      { stints: [{ driverId: driver.id }] },
    ]) {
      expect((await call(owner, 'PUT', `/api/events/${eventId}/stints`, bad)).statusCode).toBe(400);
    }
  });
});
