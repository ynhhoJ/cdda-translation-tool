/**
 * Tests for Report Command
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { reportUntranslated } from '../src/commands/report';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('Report Untranslated', () => {
  const testDir = './test-temp';
  const testPoFile = join(testDir, 'test.po');
  const outputDir = join(testDir, 'output');

  beforeEach(() => {
    // Create test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  it('should capture PO file header', async () => {
    const content = `msgid ""
msgstr ""
"Project-Id-Version: test 1.0\\n"
"Language: ru\\n"
"Content-Type: text/plain; charset=UTF-8\\n"
"Plural-Forms: nplurals=4; plural=(n%10==1 && n%100!=11 ? 0 : n%10>=2 && n%10<=4 && (n%100<12 || n%100>14) ? 1 : n%10==0 || (n%10>=5 && n%10<=9) || (n%100>=11 && n%100>=14)? 2 : 3);\\n"

#: data/json/test.json
msgid "test string"
msgstr ""
`;

    await Bun.write(testPoFile, content);

    const report = await reportUntranslated({
      input: testPoFile,
      output: outputDir,
      format: 'json',
      groupBy: 'source'
    });

    expect(report.header).toContain('Project-Id-Version: test 1.0');
    expect(report.header).toContain('Language: ru');
    expect(report.header).toContain('Plural-Forms');
  });

  it('should preserve extracted comments in untranslated entries', async () => {
    const content = `msgid ""
msgstr ""
"Language: ru\\n"

#. ~ Monster name
#: data/json/monsters.json
msgid "zombie"
msgstr ""

#. ~ Monster description
#: data/json/monsters.json
msgid "A shambling undead creature"
msgstr ""
`;

    await Bun.write(testPoFile, content);

    const report = await reportUntranslated({
      input: testPoFile,
      output: outputDir,
      format: 'json',
      groupBy: 'source'
    });

    const entries = report.groups['data/json/monsters.json']!;
    expect(entries).toBeDefined();
    expect(entries.length).toBe(2);

    expect(entries[0]!.entry.extractedComments).toContain('~ Monster name');
    expect(entries[1]!.entry.extractedComments).toContain('~ Monster description');
  });

  it('should preserve plural forms in untranslated entries', async () => {
    const content = `msgid ""
msgstr ""
"Language: ru\\n"

#: data/json/items.json
msgid "apple"
msgid_plural "apples"
msgstr[0] ""
msgstr[1] ""
msgstr[2] ""
msgstr[3] ""
`;

    await Bun.write(testPoFile, content);

    const report = await reportUntranslated({
      input: testPoFile,
      output: outputDir,
      format: 'json',
      groupBy: 'source'
    });

    const entries = report.groups['data/json/items.json']!;
    expect(entries).toBeDefined();
    expect(entries[0]!.entry.msgid_plural).toBe('apples');
    expect(entries[0]!.entry.msgstr_plural).toBeDefined();
    expect(Object.keys(entries[0]!.entry.msgstr_plural!)).toHaveLength(4);
  });

  it('should preserve flags in untranslated entries', async () => {
    const content = `msgid ""
msgstr ""
"Language: ru\\n"

#: src/test.cpp:123
#, c-format, no-wrap
msgid "Test %d"
msgstr ""
`;

    await Bun.write(testPoFile, content);

    const report = await reportUntranslated({
      input: testPoFile,
      output: outputDir,
      format: 'json',
      groupBy: 'source'
    });

    const entries = report.groups['src/test.cpp']!;
    expect(entries).toBeDefined();
    expect(entries[0]!.entry.flags).toContain('c-format');
    expect(entries[0]!.entry.flags).toContain('no-wrap');
  });

  it('should generate individual PO files with complete context', async () => {
    const content = `msgid ""
msgstr ""
"Project-Id-Version: test 1.0\\n"
"Language: ru\\n"
"Plural-Forms: nplurals=4; plural=(n%10==1 && n%100!=11 ? 0 : 1);\\n"

#. ~ Monster name
#: data/json/monsters.json
msgid "zombie"
msgid_plural "zombies"
msgstr[0] ""
msgstr[1] ""
msgstr[2] ""
msgstr[3] ""
`;

    await Bun.write(testPoFile, content);

    await reportUntranslated({
      input: testPoFile,
      output: outputDir,
      format: 'markdown',
      groupBy: 'source'
    });

    const generatedFile = join(outputDir, 'untranslated/data/json/monsters.json.po');
    expect(existsSync(generatedFile)).toBe(true);

    const generatedContent = await Bun.file(generatedFile).text();

    // Check header
    expect(generatedContent).toContain('msgid ""');
    expect(generatedContent).toContain('msgstr ""');
    expect(generatedContent).toContain('Project-Id-Version: test 1.0');
    expect(generatedContent).toContain('Language: ru');
    expect(generatedContent).toContain('Plural-Forms');

    // Check extracted comment
    expect(generatedContent).toContain('#. ~ Monster name');

    // Check reference
    expect(generatedContent).toContain('#: data/json/monsters.json');

    // Check plural forms
    expect(generatedContent).toContain('msgid "zombie"');
    expect(generatedContent).toContain('msgid_plural "zombies"');
    expect(generatedContent).toContain('msgstr[0] ""');
    expect(generatedContent).toContain('msgstr[1] ""');
    expect(generatedContent).toContain('msgstr[2] ""');
    expect(generatedContent).toContain('msgstr[3] ""');
  });

  it('should handle multiple references for same entry', async () => {
    const content = `msgid ""
msgstr ""
"Language: ru\\n"

#: data/json/items.json:10
#: data/json/items.json:20
#: data/json/weapons.json:5
msgid "sword"
msgstr ""
`;

    await Bun.write(testPoFile, content);

    const report = await reportUntranslated({
      input: testPoFile,
      output: outputDir,
      format: 'json',
      groupBy: 'source'
    });

    const entries = report.groups['data/json/items.json']!;
    expect(entries).toBeDefined();
    expect(entries[0]!.entry.references).toHaveLength(3);
    expect(entries[0]!.entry.references).toContain('data/json/items.json:10');
    expect(entries[0]!.entry.references).toContain('data/json/items.json:20');
    expect(entries[0]!.entry.references).toContain('data/json/weapons.json:5');
  });

  it('should count untranslated and fuzzy entries correctly', async () => {
    const content = `msgid ""
msgstr ""
"Language: ru\\n"

#: test.json:1
msgid "untranslated"
msgstr ""

#: test.json:2
#, fuzzy
msgid "fuzzy entry"
msgstr "нечеткая запись"

#: test.json:3
msgid "translated"
msgstr "переведено"
`;

    await Bun.write(testPoFile, content);

    const report = await reportUntranslated({
      input: testPoFile,
      output: outputDir,
      format: 'json',
      groupBy: 'source'
    });

    expect(report.totalEntries).toBe(3);
    expect(report.untranslatedCount).toBe(1);
    expect(report.fuzzyCount).toBe(1);
    expect(report.translatedCount).toBe(2);
  });

  it('should sort untranslated entries before fuzzy entries', async () => {
    const content = `msgid ""
msgstr ""
"Language: ru\\n"

#: test.json:1
#, fuzzy
msgid "fuzzy 1"
msgstr "нечеткий 1"

#: test.json:2
msgid "untranslated 1"
msgstr ""

#: test.json:3
#, fuzzy
msgid "fuzzy 2"
msgstr "нечеткий 2"

#: test.json:4
msgid "untranslated 2"
msgstr ""
`;

    await Bun.write(testPoFile, content);

    await reportUntranslated({
      input: testPoFile,
      output: outputDir,
      format: 'markdown',
      groupBy: 'source'
    });

    const generatedFile = join(outputDir, 'untranslated/test.json.po');
    const generatedContent = await Bun.file(generatedFile).text();

    // Find positions of entries
    const untranslated1Pos = generatedContent.indexOf('msgid "untranslated 1"');
    const untranslated2Pos = generatedContent.indexOf('msgid "untranslated 2"');
    const fuzzy1Pos = generatedContent.indexOf('msgid "fuzzy 1"');
    const fuzzy2Pos = generatedContent.indexOf('msgid "fuzzy 2"');

    // Untranslated entries should come before fuzzy entries
    expect(untranslated1Pos).toBeLessThan(fuzzy1Pos);
    expect(untranslated2Pos).toBeLessThan(fuzzy1Pos);
  });

  it('should handle entries with msgctxt', async () => {
    const content = `msgid ""
msgstr ""
"Language: ru\\n"

#: test.json
msgctxt "menu"
msgid "File"
msgstr ""
`;

    await Bun.write(testPoFile, content);

    await reportUntranslated({
      input: testPoFile,
      output: outputDir,
      format: 'markdown',
      groupBy: 'source'
    });

    const generatedFile = join(outputDir, 'untranslated/test.json.po');
    const generatedContent = await Bun.file(generatedFile).text();

    expect(generatedContent).toContain('msgctxt "menu"');
    expect(generatedContent).toContain('msgid "File"');
  });

  it('should escape special characters in strings', async () => {
    const content = `msgid ""
msgstr ""
"Language: ru\\n"

#: test.json
msgid "String with \\"quotes\\" and \\nnewlines\\t and tabs"
msgstr ""
`;

    await Bun.write(testPoFile, content);

    await reportUntranslated({
      input: testPoFile,
      output: outputDir,
      format: 'markdown',
      groupBy: 'source'
    });

    const generatedFile = join(outputDir, 'untranslated/test.json.po');
    const generatedContent = await Bun.file(generatedFile).text();

    // Should preserve escaping
    expect(generatedContent).toContain('\\"quotes\\"');
    expect(generatedContent).toContain('\\n');
    expect(generatedContent).toContain('\\t');
  });

  it('should use plural count from PO header for fallback plural forms', async () => {
    const content = `msgid ""
msgstr ""
"Language: de\\n"
"Plural-Forms: nplurals=2; plural=(n != 1);\\n"

#: data/json/items.json
msgid "apple"
msgid_plural "apples"
msgstr[0] ""
msgstr[1] ""
`;

    await Bun.write(testPoFile, content);

    await reportUntranslated({
      input: testPoFile,
      output: outputDir,
      format: 'markdown',
      groupBy: 'source'
    });

    const generatedFile = join(outputDir, 'untranslated/data/json/items.json.po');
    expect(existsSync(generatedFile)).toBe(true);

    const generatedContent = await Bun.file(generatedFile).text();

    // German has 2 plural forms
    expect(generatedContent).toContain('msgstr[0] ""');
    expect(generatedContent).toContain('msgstr[1] ""');
    expect(generatedContent).not.toContain('msgstr[2] ""');
    expect(generatedContent).not.toContain('msgstr[3] ""');
  });
});
