import { describe, expect, it } from 'vitest';
import { isValidTimeZone } from './timezones';
import { CAR_CLASSES, findTrack, TRACKS, trackKey } from './tracks';

describe('track list', () => {
  it('uses real IANA zones and plausible starting values', () => {
    for (const t of TRACKS) {
      expect(isValidTimeZone(t.timezone), t.name).toBe(true);
      expect(t.pitLaneLossSeconds).toBeGreaterThan(0);
    }
    expect(new Set(TRACKS.map((t) => trackKey(t.name))).size).toBe(TRACKS.length);
  });

  it('matches names regardless of case and spacing', () => {
    expect(trackKey('  Circuit de la Sarthe   (Le Mans) ')).toBe('circuit de la sarthe (le mans)');
    expect(findTrack('circuit de la sarthe (le mans)')?.timezone).toBe('Europe/Paris');
    expect(findTrack('My custom track')).toBeUndefined();
    expect(findTrack(null)).toBeUndefined();
  });

  it('suggests a fuel unit per class', () => {
    expect(CAR_CLASSES.find((c) => c.name === 'LMP2')?.fuelUnit).toBe('litres');
    expect(CAR_CLASSES.find((c) => c.name === 'LMGT3')?.fuelUnit).toBe('percent');
  });
});
