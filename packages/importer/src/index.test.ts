import { describe, expect, it } from 'vitest';
import { sniffType } from './index';

const bytes = (...b: number[]) => new Uint8Array(b);

describe('sniffType', () => {
  it('detects PDF, PNG, JPEG and WebP by magic bytes', () => {
    expect(sniffType(bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31))).toBe('pdf');
    expect(sniffType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('png');
    expect(sniffType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('jpeg');
    expect(sniffType(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))).toBe(
      'webp',
    );
  });

  it('returns unknown for anything else, including truncated headers', () => {
    expect(sniffType(bytes(0x3c, 0x73, 0x76, 0x67))).toBe('unknown'); // "<svg" is not accepted
    expect(sniffType(bytes(0x25, 0x50))).toBe('unknown');
    expect(sniffType(bytes())).toBe('unknown');
  });
});
