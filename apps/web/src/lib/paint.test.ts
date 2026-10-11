import { describe, expect, it } from 'vitest';
import { paintRange, rowsFor } from './paint';

const show = (p: (string | null)[]) => p.map((s) => (s ? 'A' : '.')).join('');

describe('paintRange', () => {
  it('paints an inclusive range in either direction', () => {
    const empty = Array.from({ length: 8 }, () => null);
    const forward = paintRange(empty, 1, 4, 'available');
    expect(show(forward)).toBe('.AAAA...');
    expect(paintRange(empty, 4, 1, 'available')).toEqual(forward);
    expect(show(paintRange(forward, 2, 2, null))).toBe('.A.AA...');
  });
});

describe('rows', () => {
  it('keeps short races on one row and wraps long ones every 6 hours', () => {
    expect(rowsFor(24)).toEqual([{ start: 0, end: 24 }]);
    expect(rowsFor(32)).toEqual([{ start: 0, end: 32 }]);
    expect(rowsFor(96)).toHaveLength(4);
    expect(rowsFor(100).at(-1)).toEqual({ start: 96, end: 100 });
  });
});
