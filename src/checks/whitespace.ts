/**
 * Whitespace Check - Validates leading/trailing whitespace consistency
 *
 * Based on Poedit's qa_checks.cpp WhitespaceMismatch check
 */

import type { PoEntry, QaIssue } from '../types';
import type { QaCheck, QaContext } from './base';
import { createIssue } from './base';

export const whitespaceCheck: QaCheck = {
  id: 'whitespace',
  name: 'Whitespace Consistency',
  description: 'Checks that leading/trailing whitespace matches between source and translation',
  defaultSeverity: 'warning',

  check(entry: PoEntry, _context?: QaContext): QaIssue[] {
    const issues: QaIssue[] = [];

    // Skip untranslated entries or entries without msgstr
    if (entry.isUntranslated || !entry.msgstr) {
      return issues;
    }

    const source = entry.msgid || '';
    const translation = entry.msgstr || '';

    if (!translation) return issues;

    // Check leading space
    const sourceStartsSpace = /^\s/.test(source);
    const transStartsSpace = /^\s/.test(translation);

    if (sourceStartsSpace && !transStartsSpace) {
      issues.push(createIssue(this, entry,
        "The translation doesn't start with whitespace, but the source does.",
        {
          suggestion: ' ' + translation.trimStart(),
          context: 'Leading whitespace is often significant for formatting.'
        }
      ));
    } else if (!sourceStartsSpace && transStartsSpace) {
      issues.push(createIssue(this, entry,
        "The translation starts with whitespace, but the source doesn't.",
        {
          suggestion: translation.trimStart(),
          context: 'Extra leading whitespace may cause formatting issues.'
        }
      ));
    }

    // Check trailing space
    const sourceEndsSpace = /\s$/.test(source) && !source.endsWith('\n');
    const transEndsSpace = /\s$/.test(translation) && !translation.endsWith('\n');

    if (sourceEndsSpace && !transEndsSpace) {
      issues.push(createIssue(this, entry,
        "The translation is missing whitespace at the end.",
        {
          suggestion: translation + ' ',
          context: 'Trailing whitespace is often significant for concatenation.'
        }
      ));
    } else if (!sourceEndsSpace && transEndsSpace) {
      issues.push(createIssue(this, entry,
        "The translation ends with whitespace, but the source doesn't.",
        {
          suggestion: translation.trimEnd(),
          context: 'Extra trailing whitespace may cause formatting issues.'
        }
      ));
    }

    // Check trailing newline
    const sourceEndsNewline = source.endsWith('\n');
    const transEndsNewline = translation.endsWith('\n');

    if (sourceEndsNewline && !transEndsNewline) {
      issues.push(createIssue(this, entry,
        "The translation is missing a newline at the end.",
        {
          suggestion: translation + '\n',
          context: 'Trailing newlines are often required for proper text flow.'
        }
      ));
    } else if (!sourceEndsNewline && transEndsNewline) {
      issues.push(createIssue(this, entry,
        "The translation ends with a newline, but the source doesn't.",
        {
          suggestion: translation.replace(/\n+$/, ''),
          context: 'Extra trailing newlines may cause formatting issues.'
        }
      ));
    }

    return issues;
  }
};
