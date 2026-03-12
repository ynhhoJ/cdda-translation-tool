/**
 * Tests for QA Checks
 */

import { describe, expect, it, beforeEach } from 'bun:test';
import { placeholderCheck } from '../src/checks/placeholders';
import { whitespaceCheck } from '../src/checks/whitespace';
import { punctuationCheck } from '../src/checks/punctuation';
import { resetIssueCounter } from '../src/checks/base';
import type { PoEntry } from '../src/types';

function makeEntry(msgid: string, msgstr: string, overrides: Partial<PoEntry> = {}): PoEntry {
  return {
    references: ['test.json:1'],
    translatorComments: [],
    extractedComments: [],
    flags: [],
    msgid,
    msgstr,
    lineNumber: 1,
    isFuzzy: false,
    isUntranslated: msgstr === '',
    ...overrides
  };
}

describe('Placeholder Check', () => {
  beforeEach(() => {
    resetIssueCounter();
  });

  it('should pass when placeholders match', () => {
    const entry = makeEntry('Hello %s', 'Привет %s');
    const issues = placeholderCheck.check(entry);

    expect(issues).toHaveLength(0);
  });

  it('should flag missing placeholder in translation', () => {
    const entry = makeEntry('Hello %s', 'Привет');
    const issues = placeholderCheck.check(entry);

    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain('missing');
    expect(issues[0]!.message).toContain('%s');
  });

  it('should flag extra placeholder in translation', () => {
    const entry = makeEntry('Hello', 'Привет %s');
    const issues = placeholderCheck.check(entry);

    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain('Superfluous');
  });

  it('should skip untranslated entries', () => {
    const entry = makeEntry('Hello %s', '');
    const issues = placeholderCheck.check(entry);

    expect(issues).toHaveLength(0);
  });

  it('should handle multiple placeholders', () => {
    const entry = makeEntry('%d items of %s', '%d штук %s');
    const issues = placeholderCheck.check(entry);

    expect(issues).toHaveLength(0);
  });

  it('should normalize positional placeholders', () => {
    // %1$s and %s should be treated as equivalent
    const entry = makeEntry('%1$s and %2$d', '%s и %d');
    const issues = placeholderCheck.check(entry);

    expect(issues).toHaveLength(0);
  });

  it('should handle tags like <npcname>', () => {
    const entry = makeEntry('<npcname> says hello', '<npcname> говорит привет');
    const issues = placeholderCheck.check(entry);

    expect(issues).toHaveLength(0);
  });
});

describe('Whitespace Check', () => {
  beforeEach(() => {
    resetIssueCounter();
  });

  it('should pass when whitespace matches', () => {
    const entry = makeEntry('Hello', 'Привет');
    const issues = whitespaceCheck.check(entry);

    expect(issues).toHaveLength(0);
  });

  it('should flag missing leading space', () => {
    const entry = makeEntry(' Hello', 'Привет');
    const issues = whitespaceCheck.check(entry);

    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("doesn't start with whitespace");
  });

  it('should flag extra leading space', () => {
    const entry = makeEntry('Hello', ' Привет');
    const issues = whitespaceCheck.check(entry);

    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain('starts with whitespace');
  });

  it('should flag missing trailing newline', () => {
    const entry = makeEntry('Hello\n', 'Привет');
    const issues = whitespaceCheck.check(entry);

    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain('missing a newline');
  });
});

describe('Punctuation Check', () => {
  beforeEach(() => {
    resetIssueCounter();
  });

  it('should pass when punctuation matches', () => {
    const entry = makeEntry('Hello!', 'Привет!');
    const issues = punctuationCheck.check(entry);

    expect(issues).toHaveLength(0);
  });

  it('should flag missing period', () => {
    const entry = makeEntry('Hello.', 'Привет');
    const issues = punctuationCheck.check(entry);

    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain('should end with "."');
  });

  it('should flag extra punctuation', () => {
    const entry = makeEntry('Hello', 'Привет.');
    const issues = punctuationCheck.check(entry);

    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain('should not end with');
  });

  it('should allow ... to become …', () => {
    const entry = makeEntry('Hello...', 'Привет…');
    const issues = punctuationCheck.check(entry);

    expect(issues).toHaveLength(0);
  });
});
