import { describe, expect, it } from 'vitest';
import { formatDuration, formatRelative } from './format';

describe('formatDuration', () => {
  it('reads naturally', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(360)).toBe('6 h');
    expect(formatDuration(150)).toBe('2 h 30 min');
    expect(formatDuration(1440)).toBe('24 h');
  });
});

describe('formatRelative', () => {
  const now = new Date('2026-11-14T18:00:00Z');
  it('picks a sensible unit', () => {
    expect(formatRelative(new Date('2026-11-14T18:20:00Z'), now)).toBe('in 20 minutes');
    expect(formatRelative(new Date('2026-11-15T00:00:00Z'), now)).toBe('in 6 hours');
    expect(formatRelative(new Date('2026-11-17T18:00:00Z'), now)).toBe('in 3 days');
    expect(formatRelative(new Date('2026-11-14T16:00:00Z'), now)).toBe('2 hours ago');
  });
});
