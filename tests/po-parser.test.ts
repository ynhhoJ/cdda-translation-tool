/**
 * Tests for PO Parser
 */

import { describe, expect, it } from 'bun:test';
import { parsePo, serializePo, groupEntriesBySource } from '../src/lib/po-parser';

describe('PO Parser', () => {
  it('should parse a simple .po entry', () => {
    const content = `
msgid "Hello"
msgstr "Привет"
`;

    const result = parsePo(content);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.msgid).toBe('Hello');
    expect(result.entries[0]!.msgstr).toBe('Привет');
  });

  it('should parse entries with references', () => {
    const content = `
#: data/json/items.json:123
msgid "apple"
msgstr "яблоко"
`;

    const result = parsePo(content);

    expect(result.entries[0]!.references).toContain('data/json/items.json:123');
  });

  it('should parse fuzzy entries', () => {
    const content = `
#, fuzzy
msgid "test"
msgstr "тест"
`;

    const result = parsePo(content);

    expect(result.entries[0]!.isFuzzy).toBe(true);
    expect(result.entries[0]!.flags).toContain('fuzzy');
  });

  it('should detect untranslated entries', () => {
    const content = `
msgid "untranslated string"
msgstr ""
`;

    const result = parsePo(content);

    expect(result.entries[0]!.isUntranslated).toBe(true);
  });

  it('should parse plural forms', () => {
    const content = `
msgid "One apple"
msgid_plural "%d apples"
msgstr[0] "Одно яблоко"
msgstr[1] "яблока"
msgstr[2] "яблок"
msgstr[3] "яблоки"
`;

    const result = parsePo(content);

    expect(result.entries[0]!.msgid_plural).toBe('%d apples');
    expect(result.entries[0]!.msgstr_plural?.[0]).toBe('Одно яблоко');
    expect(result.entries[0]!.msgstr_plural?.[2]).toBe('яблок');
  });

  it('should parse multiline strings', () => {
    const content = `
msgid ""
"This is a "
"multiline string"
msgstr ""
"Это многострочная "
"строка"
`;

    const result = parsePo(content);

    expect(result.entries[0]!.msgid).toBe('This is a multiline string');
    expect(result.entries[0]!.msgstr).toBe('Это многострочная строка');
  });

  it('should parse context (msgctxt)', () => {
    const content = `
msgctxt "menu"
msgid "File"
msgstr "Файл"
`;

    const result = parsePo(content);

    expect(result.entries[0]!.msgctxt).toBe('menu');
  });

  it('should parse header', () => {
    const content = `
msgid ""
msgstr ""
"Language: ru\\n"
"Content-Type: text/plain; charset=UTF-8\\n"

msgid "test"
msgstr "тест"
`;

    const result = parsePo(content);

    expect(result.header.language).toBe('ru');
    expect(result.entries).toHaveLength(1);
  });

  it('should parse Plural-Forms header', () => {

    const content = `
msgid ""
msgstr ""
"Language: de\\n"
"Plural-Forms: nplurals=2; plural=(n != 1);\\n"

msgid "test"
msgstr "Test"
`;

    const result = parsePo(content);

    expect(result.header.language).toBe('de');
    expect(result.header.pluralForms).toContain('nplurals=2');
  });
});

describe('Group Entries By Source', () => {
  it('should group entries by source file', () => {
    const content = `
#: data/json/items.json:10
msgid "apple"
msgstr "яблоко"

#: data/json/items.json:20
msgid "banana"
msgstr "банан"

#: data/json/monsters.json:5
msgid "zombie"
msgstr "зомби"
`;

    const result = parsePo(content);
    const groups = groupEntriesBySource(result.entries);

    expect(groups.size).toBe(2);
    expect(groups.get('data/json/items.json')?.length).toBe(2);
    expect(groups.get('data/json/monsters.json')?.length).toBe(1);
  });
});

describe('PO Serializer', () => {
  it('should round-trip a simple entry', () => {
    const content = `msgid "Hello"
msgstr "Привет"

`;

    const parsed = parsePo(content);
    const serialized = serializePo(parsed);
    const reparsed = parsePo(serialized);

    expect(reparsed.entries[0]!.msgid).toBe(parsed.entries[0]!.msgid);
    expect(reparsed.entries[0]!.msgstr).toBe(parsed.entries[0]!.msgstr);
  });

  it('should correctly unescape backslash sequences', () => {
    const content = `
msgid "hello\\\\nworld"
msgstr "привет\\\\nмир"
`;

    const result = parsePo(content);
    // \\n in PO = escaped backslash + literal n = \n (backslash + n)
    expect(result.entries[0]!.msgid).toBe('hello\\nworld');
    expect(result.entries[0]!.msgstr).toBe('привет\\nмир');
  });

  it('should correctly handle escaped quotes', () => {
    const content = `
msgid "She said \\"hello\\""
msgstr "Она сказала \\"привет\\""
`;

    const result = parsePo(content);
    expect(result.entries[0]!.msgid).toBe('She said "hello"');
    expect(result.entries[0]!.msgstr).toBe('Она сказала "привет"');
  });
});
