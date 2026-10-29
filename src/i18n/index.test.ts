import { describe, expect, it } from 'vitest';
import { formatBytes, formatDate, getCopy } from './index';

describe('archive translations', () => {
  it('provides the same nonempty copy for every Romanian and English key', () => {
    const ro = getCopy('ro');
    const en = getCopy('en');
    expect(Object.keys(ro).sort()).toEqual(Object.keys(en).sort());
    for (const value of [...Object.values(ro), ...Object.values(en)]) {
      expect(value.trim().length).toBeGreaterThan(0);
    }
    expect(ro.archive).toBe('Arhivă');
    expect(ro.settings).toBe('Setări');
    expect(en.archive).toBe('Archive');
  });

  it('discloses prototype privacy and native-only OCR in both languages', () => {
    for (const language of ['ro', 'en'] as const) {
      const copy = getCopy(language);
      expect(copy.privacyDescription).toMatch(/nu sunt criptate|not encrypted/);
      expect(copy.privacyTitle).toMatch(/nu folosi date reale|do not use real/);
      expect(copy.ocrExplanation).toContain('Expo Go');
      expect(copy.restoreBody).toMatch(/TOATE|ALL/);
    }
  });
});

describe('presentation formatting', () => {
  it('formats file sizes and invalid dates safely', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatDate('not a date', 'ro')).toBe('—');
    expect(formatDate('2026-10-29T12:00:00Z', 'en')).toContain('2026');
  });
});
