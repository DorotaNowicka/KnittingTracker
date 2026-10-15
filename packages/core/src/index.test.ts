import { describe, expect, it } from 'vitest';
import { FILE_FORMATS, isFileFormat, SCHEMA_VERSION } from './index';

describe('core package boundary', () => {
  it('exposes a positive integer schema version', () => {
    expect(Number.isInteger(SCHEMA_VERSION)).toBe(true);
    expect(SCHEMA_VERSION).toBeGreaterThan(0);
  });

  it('recognises only known file formats', () => {
    expect(isFileFormat(FILE_FORMATS.pattern)).toBe(true);
    expect(isFileFormat(FILE_FORMATS.backup)).toBe(true);
    expect(isFileFormat('knitting-tracker/unknown')).toBe(false);
    expect(isFileFormat(undefined)).toBe(false);
  });
});
