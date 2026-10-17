import { describe, expect, it } from 'vitest';
import { isNewerVersion } from './version';

describe('isNewerVersion', () => {
  it('compares each part as a number', () => {
    expect(isNewerVersion('10.11.10', '10.11.9')).toBe(true);
    expect(isNewerVersion('1.10.0', '1.9.0')).toBe(true);
    expect(isNewerVersion('1.4.0', '1.4.0')).toBe(false);
    expect(isNewerVersion('1.3.1', '1.4.0')).toBe(false);
  });

  it('ignores a leading "v" and treats a missing part as zero', () => {
    expect(isNewerVersion('v12.2', '10.11.11')).toBe(true);
    expect(isNewerVersion('v1.4', '1.4.0')).toBe(false);
    expect(isNewerVersion('1.4.0.1', '1.4')).toBe(true);
  });

  it('ranks a pre-release below its release', () => {
    expect(isNewerVersion('1.5.0-rc1', '1.4.0')).toBe(true);
    expect(isNewerVersion('1.5.0-rc1', '1.5.0')).toBe(false);
    expect(isNewerVersion('1.5.0', '1.5.0-rc1')).toBe(true);
  });

  it('is false when either version cannot be read', () => {
    expect(isNewerVersion('', '1.0.0')).toBe(false);
    expect(isNewerVersion('nightly', '1.0.0')).toBe(false);
    expect(isNewerVersion('1.0.0', undefined)).toBe(false);
  });
});
