import { describe, expect, it } from 'vitest';
import { resolveZone, zoneChoices } from './stintDisplay';

const me = { id: 'me', timezone: 'America/Chicago' };
const person = (id: string, name: string, timezone: string | null) => ({
  id,
  timezone,
  displayName: name,
  username: name.toLowerCase(),
});

describe('zoneChoices', () => {
  it('lists track, browser, you, then each person, without UTC', () => {
    const options = zoneChoices(
      me,
      { trackTimezone: 'Europe/Paris' },
      [
        person('me', 'Baraon', 'America/Chicago'),
        person('a', 'Lukas', 'Europe/Berlin'),
        person('b', 'Priya', 'Asia/Kolkata'),
      ],
      'America/New_York',
    );
    expect(options.map((o) => o.label)).toEqual([
      'Europe/Paris · Track time',
      'America/New_York · Browser default',
      'America/Chicago · You',
      'Europe/Berlin · Lukas',
      'Asia/Kolkata · Priya',
    ]);
    expect(options.some((o) => o.zone === 'UTC')).toBe(false);
  });

  it('merges identical zones into one entry', () => {
    const options = zoneChoices(
      me,
      { trackTimezone: 'Europe/Berlin' },
      [
        person('a', 'Lukas', 'Europe/Berlin'),
        person('b', 'Mosti', 'Europe/Berlin'),
        person('c', 'Azim', 'America/Chicago'),
        person('d', 'NoZone', null),
      ],
      'America/Chicago',
    );
    expect(options).toEqual([
      {
        zone: 'Europe/Berlin',
        who: 'Track time, Lukas, Mosti',
        label: 'Europe/Berlin · Track time, Lukas, Mosti',
      },
      {
        zone: 'America/Chicago',
        who: 'Browser default, You, Azim',
        label: 'America/Chicago · Browser default, You, Azim',
      },
    ]);
  });

  it('falls back to the viewer zone when a saved choice is no longer offered', () => {
    const options = zoneChoices(me, { trackTimezone: null }, [], 'America/Chicago');
    expect(resolveZone('Europe/Berlin', options, 'America/Chicago')).toBe('America/Chicago');
    expect(resolveZone('', options, 'America/Chicago')).toBe('America/Chicago');
    expect(resolveZone('America/Chicago', options, 'UTC')).toBe('America/Chicago');
  });
});
