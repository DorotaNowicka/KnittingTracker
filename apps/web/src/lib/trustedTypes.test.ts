import { describe, expect, it } from 'vitest';
import { isAllowedScriptUrl } from './trustedTypes';

describe('Trusted Types script URL policy', () => {
  const origin = 'https://knit.example';
  it('allows only the service worker and hashed build chunks of this origin', () => {
    expect(isAllowedScriptUrl('/sw.js', origin)).toBe(true);
    expect(isAllowedScriptUrl('https://knit.example/assets/worker-B3RzAojh.js', origin)).toBe(true);
    expect(isAllowedScriptUrl('/assets/index-abc.js', origin)).toBe(true);
    expect(isAllowedScriptUrl('https://evil.example/assets/x.js', origin)).toBe(false);
    expect(isAllowedScriptUrl('/assets/x.js?y=1', origin)).toBe(false);
    expect(isAllowedScriptUrl('/assets/../evil.js', origin)).toBe(false);
    expect(isAllowedScriptUrl('/sw.js#x', origin)).toBe(false);
    expect(isAllowedScriptUrl('data:text/javascript,alert(1)', origin)).toBe(false);
    expect(isAllowedScriptUrl('blob:https://knit.example/123', origin)).toBe(false);
    expect(isAllowedScriptUrl('/uploads/pattern.js', origin)).toBe(false);
  });
});
