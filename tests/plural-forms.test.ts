/**
 * Tests for plural-forms utilities
 */

import { describe, expect, it } from 'bun:test';
import { getPluralForms, inferPluralCount } from '../src/lib/plural-forms';

describe('getPluralForms', () => {
  it('should return 4 forms for Russian', () => {
    expect(getPluralForms('ru')).toEqual(['one', 'few', 'many', 'other']);
  });

  it('should return 4 forms for Ukrainian', () => {
    expect(getPluralForms('uk')).toEqual(['one', 'few', 'many', 'other']);
  });

  it('should return 2 forms for German', () => {
    expect(getPluralForms('de')).toEqual(['one', 'other']);
  });

  it('should return 2 forms for English', () => {
    expect(getPluralForms('en')).toEqual(['one', 'other']);
  });

  it('should return 2 forms for French', () => {
    expect(getPluralForms('fr')).toEqual(['one', 'other']);
  });

  it('should return 1 form for Japanese', () => {
    expect(getPluralForms('ja')).toEqual(['other']);
  });

  it('should return 1 form for Chinese', () => {
    expect(getPluralForms('zh')).toEqual(['other']);
  });

  it('should return 1 form for Azerbaijani', () => {
    expect(getPluralForms('az')).toEqual(['other']);
  });

  it('should return 6 forms for Arabic', () => {
    expect(getPluralForms('ar')).toEqual(['zero', 'one', 'two', 'few', 'many', 'other']);
  });

  it('should return 3 forms for Latvian', () => {
    expect(getPluralForms('lv')).toEqual(['zero', 'one', 'other']);
  });

  it('should handle uppercase language codes', () => {
    expect(getPluralForms('RU')).toEqual(['one', 'few', 'many', 'other']);
  });

  it('should handle locale codes with region', () => {
    expect(getPluralForms('ru-RU')).toEqual(['one', 'few', 'many', 'other']);
    expect(getPluralForms('de_DE')).toEqual(['one', 'other']);
  });

  it('should return default 2 forms for unknown language', () => {
    expect(getPluralForms('xx')).toEqual(['one', 'other']);
    expect(getPluralForms('')).toEqual(['one', 'other']);
  });
});

describe('inferPluralCount', () => {
  it('should parse nplurals=4 from Russian plural forms', () => {
    const header = 'nplurals=4; plural=(n%10==1 && n%100!=11 ? 0 : 1);';
    expect(inferPluralCount(header)).toBe(4);
  });

  it('should parse nplurals=2 from German plural forms', () => {
    const header = 'nplurals=2; plural=(n != 1);';
    expect(inferPluralCount(header)).toBe(2);
  });

  it('should parse nplurals=1', () => {
    const header = 'nplurals=1; plural=0;';
    expect(inferPluralCount(header)).toBe(1);
  });

  it('should parse nplurals=6 for Arabic', () => {
    const header = 'nplurals=6; plural=...';
    expect(inferPluralCount(header)).toBe(6);
  });

  it('should return 2 as default for undefined', () => {
    expect(inferPluralCount(undefined)).toBe(2);
  });

  it('should return 2 as default for empty string', () => {
    expect(inferPluralCount('')).toBe(2);
  });

  it('should return 2 as default for invalid string', () => {
    expect(inferPluralCount('no match here')).toBe(2);
  });
});
