import { describe, expect, it } from 'vitest';
import {
  diagnostic,
  FILE_FORMATS,
  gcd,
  hasErrors,
  isFileFormat,
  lcm,
  mod,
  resolveSize,
  SCHEMA_VERSION,
} from './basics';

describe('basics', () => {
  it('exposes a positive integer schema version and known file formats', () => {
    expect(Number.isInteger(SCHEMA_VERSION) && SCHEMA_VERSION > 0).toBe(true);
    expect(isFileFormat(FILE_FORMATS.pattern)).toBe(true);
    expect(isFileFormat(FILE_FORMATS.backup)).toBe(true);
    expect(isFileFormat('knitting-tracker/unknown')).toBe(false);
  });

  it('resolves per-size values', () => {
    expect(resolveSize(7, 3)).toBe(7);
    expect(resolveSize([19, 22, 28], 1)).toBe(22);
    expect(() => resolveSize([1, 2], 2)).toThrow(RangeError);
  });

  it('builds diagnostics without undefined location fields', () => {
    expect(diagnostic('x', 'error', 'm')).toEqual({ code: 'x', severity: 'error', message: 'm' });
    expect(diagnostic('x', 'info', 'm', { chartId: 'c', patternId: 's', row: 2, col: 3 })).toEqual({
      code: 'x',
      severity: 'info',
      message: 'm',
      chartId: 'c',
      patternId: 's',
      row: 2,
      col: 3,
    });
    expect(hasErrors([diagnostic('a', 'warning', 'w')])).toBe(false);
    expect(hasErrors([diagnostic('a', 'error', 'e')])).toBe(true);
  });

  it('computes positive modulo, gcd and lcm', () => {
    expect(mod(-1, 5)).toBe(4);
    expect(mod(7, 5)).toBe(2);
    expect(gcd(12, 18)).toBe(6);
    expect(lcm(22, 20)).toBe(220);
    expect(lcm(lcm(22, 9), 20)).toBe(1980);
  });
});
