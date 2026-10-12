import { describe, expect, it } from 'vitest';
import {
  averagePace,
  formatLapTime,
  formatStintLength,
  lapsPerStint,
  parseLapTime,
  stintDurationMs,
} from './stints';

describe('laps and stint length', () => {
  it('uses whole laps the tank allows', () => {
    // The team spreadsheet's example values, as plain inputs.
    expect(lapsPerStint(100, 9.39)).toBe(10);
    expect(lapsPerStint(100, 9.02)).toBe(11);
    expect(lapsPerStint(100, 10)).toBe(10); // exact fit doesn't lose a lap to float error
    expect(lapsPerStint(75, 3.1)).toBe(24); // litres work the same way
    expect(lapsPerStint(100, 0)).toBe(1); // nonsense input never stalls a plan
    expect(stintDurationMs(11, 242_000)).toBe(2_662_000);
  });

  it('averages the drivers who entered numbers', () => {
    expect(averagePace([])).toBeNull();
    expect(
      averagePace([
        { lapMs: 240_000, consumptionPerLap: 9 },
        { lapMs: 242_000, consumptionPerLap: 10 },
      ]),
    ).toEqual({ lapMs: 241_000, consumptionPerLap: 9.5 });
  });
});

describe('lap time text', () => {
  it('parses common ways of writing a lap', () => {
    expect(parseLapTime('3:59.123')).toBe(239_123);
    expect(parseLapTime(' 4:02 ')).toBe(242_000);
    expect(parseLapTime('4:02.5')).toBe(242_500);
    expect(parseLapTime('59.5')).toBe(59_500);
    expect(parseLapTime('4:75')).toBeNull();
    expect(parseLapTime('fast')).toBeNull();
    expect(parseLapTime('0')).toBeNull();
  });

  it('formats laps and stint lengths', () => {
    expect(formatLapTime(239_123)).toBe('3:59.123');
    expect(formatLapTime(240_000)).toBe('4:00.0');
    expect(formatLapTime(65_500)).toBe('1:05.5');
    expect(parseLapTime(formatLapTime(242_250))).toBe(242_250);
    expect(formatStintLength(2_662_000)).toBe('44 min 22 s');
    expect(formatStintLength(7_200_000)).toBe('2 h 0 min');
  });
});
