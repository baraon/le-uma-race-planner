import { describe, expect, it } from 'vitest';
import { chunkOf, defaultStep, paintChunks, rowsFor } from './paint';

describe('brush steps', () => {
  it('defaults by race length', () => {
    expect(defaultStep(24)).toBe(1); // 6 h
    expect(defaultStep(47)).toBe(1);
    expect(defaultStep(48)).toBe(2); // 12 h
    expect(defaultStep(96)).toBe(4); // 24 h
  });

  it('finds chunks aligned to the green flag, clipped at the end', () => {
    expect(chunkOf(5, 4, 96)).toEqual([4, 8]);
    expect(chunkOf(0, 2, 96)).toEqual([0, 2]);
    expect(chunkOf(6, 4, 7)).toEqual([4, 7]); // final partial chunk
  });

  it('paints whole chunks across a drag in either direction', () => {
    const empty = Array.from({ length: 12 }, () => null);
    const forward = paintChunks(empty, 1, 5, 4, 'available');
    expect(forward.map((s) => (s ? 'A' : '.')).join('')).toBe('AAAAAAAA....');
    expect(paintChunks(empty, 5, 1, 4, 'available')).toEqual(forward);
    expect(
      paintChunks(forward, 2, 2, 1, null)
        .map((s) => (s ? 'A' : '.'))
        .join(''),
    ).toBe('AA.AAAAA....');
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
