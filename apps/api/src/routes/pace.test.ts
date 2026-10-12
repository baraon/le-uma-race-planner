/** Driver pace profiles through events, against a real Postgres. */
import { groupDetailSchema, paceRowSchema } from '@le-uma/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db, Sql } from '../db/client';
import { DATABASE_URL, openTestDb, signedInUser, testApp, type TestUser } from '../test-utils';

describe.skipIf(!DATABASE_URL)('driver pace', () => {
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
    name: 'Le Mans 24',
    startsAt: '2027-06-12T14:00:00.000Z',
    durationMinutes: 1440,
    track: 'Circuit de la Sarthe (Le Mans)',
    carClass: 'LMGT3',
  };

  async function setup() {
    const owner = await signedInUser(db, 'owner');
    const driver = await signedInUser(db, 'driver');
    const bystander = await signedInUser(db, 'bystander');
    const group = groupDetailSchema.parse(
      (await call(owner, 'POST', '/api/groups', { name: 'Pace' })).json(),
    );
    const token = (
      await call(owner, 'POST', `/api/groups/${group.id}/invites`, {
        expiresInHours: null,
        maxUses: null,
      })
    ).json().token as string;
    for (const u of [driver, bystander]) await call(u, 'POST', `/api/invites/${token}/accept`);
    const team = groupDetailSchema.parse(
      (await call(owner, 'POST', `/api/groups/${group.id}/teams`, { name: 'GT3 #97' })).json(),
    ).teams[0]!;
    for (const u of [owner, driver]) await call(u, 'POST', `/api/teams/${team.id}/join`);
    const event = (await call(owner, 'POST', `/api/teams/${team.id}/events`, race)).json();
    return { owner, driver, bystander, team, eventId: event.id as string };
  }

  it('saves a driver’s own pace and reuses it for every event at the same track and class', async () => {
    const { owner, driver, team, eventId } = await setup();
    const res = await call(driver, 'PUT', `/api/events/${eventId}/pace/${driver.id}`, {
      lapMs: 240_500,
      consumptionPerLap: 9.03,
    });
    expect(res.statusCode).toBe(200);
    expect(paceRowSchema.parse(res.json())).toMatchObject({
      userId: driver.id,
      lapMs: 240_500,
      updatedBy: driver.id,
    });

    // A second event at the same track and class (typed differently) sees the same profile.
    const again = (
      await call(owner, 'POST', `/api/teams/${team.id}/events`, {
        ...race,
        name: 'Le Mans rematch',
        track: '  circuit de la sarthe  (le mans) ',
        carClass: 'lmgt3',
      })
    ).json();
    const rows = (await call(owner, 'GET', `/api/events/${again.id}/pace`)).json();
    expect(rows).toEqual([
      expect.objectContaining({ userId: driver.id, lapMs: 240_500, consumptionPerLap: 9.03 }),
    ]);

    // A different class or fuel unit is a different profile.
    const lmp2 = (
      await call(owner, 'POST', `/api/teams/${team.id}/events`, {
        ...race,
        name: 'LMP2',
        carClass: 'LMP2',
        fuelUnit: 'litres',
      })
    ).json();
    expect((await call(owner, 'GET', `/api/events/${lmp2.id}/pace`)).json()).toEqual([]);

    // Saving again updates in place.
    await call(driver, 'PUT', `/api/events/${eventId}/pace/${driver.id}`, {
      lapMs: 239_000,
      consumptionPerLap: 9.1,
    });
    const updated = (await call(driver, 'GET', `/api/events/${eventId}/pace`)).json();
    expect(updated).toEqual([expect.objectContaining({ lapMs: 239_000, consumptionPerLap: 9.1 })]);
  });

  it('lets only the driver or an event manager edit, and only for team drivers', async () => {
    const { owner, driver, bystander, eventId } = await setup();
    const pace = { lapMs: 241_000, consumptionPerLap: 9.4 };
    expect(
      (await call(bystander, 'PUT', `/api/events/${eventId}/pace/${driver.id}`, pace)).statusCode,
    ).toBe(403);
    const byOwner = await call(owner, 'PUT', `/api/events/${eventId}/pace/${driver.id}`, pace);
    expect(byOwner.json().updatedBy).toBe(owner.id);
    expect(
      (await call(owner, 'PUT', `/api/events/${eventId}/pace/${bystander.id}`, pace)).statusCode,
    ).toBe(409);
    expect((await call(bystander, 'GET', `/api/events/${eventId}/pace`)).statusCode).toBe(200);
    const stranger = await signedInUser(db, 'stranger');
    expect((await call(stranger, 'GET', `/api/events/${eventId}/pace`)).statusCode).toBe(404);

    expect(
      (await call(driver, 'DELETE', `/api/events/${eventId}/pace/${driver.id}`)).statusCode,
    ).toBe(204);
    expect((await call(driver, 'GET', `/api/events/${eventId}/pace`)).json()).toEqual([]);
  });

  it('validates values and needs a track and class on the event', async () => {
    const { owner, driver, team, eventId } = await setup();
    for (const bad of [
      { lapMs: 5_000, consumptionPerLap: 9 },
      { lapMs: 240_000, consumptionPerLap: 0 },
      { lapMs: 240_000 },
    ]) {
      expect(
        (await call(driver, 'PUT', `/api/events/${eventId}/pace/${driver.id}`, bad)).statusCode,
      ).toBe(400);
    }
    const bare = (
      await call(owner, 'POST', `/api/teams/${team.id}/events`, {
        ...race,
        track: '',
        carClass: '',
      })
    ).json();
    expect((await call(driver, 'GET', `/api/events/${bare.id}/pace`)).json()).toEqual([]);
    expect(
      (
        await call(driver, 'PUT', `/api/events/${bare.id}/pace/${driver.id}`, {
          lapMs: 240_000,
          consumptionPerLap: 9,
        })
      ).statusCode,
    ).toBe(409);
  });
});
