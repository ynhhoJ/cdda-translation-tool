/**
 * Punctuation Check - Validates ending punctuation consistency
 *
 * Based on Poedit's qa_checks.cpp PunctuationMismatch check
 */

import type { PoEntry, QaIssue } from '../types';
import type { QaCheck, QaContext } from './base';
import { createIssue } from './base';

// Punctuation characters that should match between source and translation
const PUNCTUATION = /[.!?;:,。！？；：，…]$/;

export const punctuationCheck: QaCheck = {
  id: 'punctuation',
  name: 'Punctuation Consistency',
  description: 'Checks that ending punctuation is consistent between source and translation',
  defaultSeverity: 'warning',

  check(entry: PoEntry, context?: QaContext): QaIssue[] {
    const issues: QaIssue[] = [];

    // Skip untranslated entries or entries without msgstr
    if (entry.isUntranslated || !entry.msgstr) {
      return issues;
    }

    const source = entry.msgid?.trim() || '';
    const translation = entry.msgstr?.trim() || '';

    if (!translation || !source) return issues;

    const sourceLast = source.slice(-1);
    const transLast = translation.slice(-1);

    const sourceIsPunct = PUNCTUATION.test(source);
    const transIsPunct = PUNCTUATION.test(translation);

    // Check for bracket endings (skip - too many false positives with reordering)
    if (isClosingBracket(sourceLast) || isClosingBracket(transLast)) {
      return issues;
    }

    // Check for quote endings (skip - quotes can move around)
    if (isQuote(sourceLast) || isQuote(transLast)) {
      return issues;
    }

    // Source ends with punctuation but translation doesn't
    if (sourceIsPunct && !transIsPunct) {
      issues.push(createIssue(this, entry,
        `The translation should end with "${sourceLast}".`,
        {
          suggestion: translation + sourceLast,
          context: `Source ends with "${sourceLast}" but translation ends with "${transLast}".`
        }
      ));
    }
    // Translation ends with punctuation but source doesn't
    else if (!sourceIsPunct && transIsPunct) {
      // Special case: English ordinals (1st, 2nd, 3rd, etc.) -> languages that use "1."
      if (transLast === '.' && /(?:st|nd|rd|th)$/.test(source)) {
        return issues;
      }

      issues.push(createIssue(this, entry,
        `The translation should not end with "${transLast}".`,
        {
          suggestion: translation.slice(0, -1),
          context: `Translation ends with "${transLast}" but source ends with "${sourceLast}".`
        }
      ));
    }
    // Both have punctuation but they're different
    else if (sourceIsPunct && transIsPunct && sourceLast !== transLast) {
      // Allow ... -> … (three dots to ellipsis)
      if (source.endsWith('...') && translation.endsWith('…')) {
        return issues;
      }
      if (source.endsWith('…') && translation.endsWith('...')) {
        return issues;
      }

      // Allow equivalent quotes
      if (isQuote(sourceLast) && isQuote(transLast)) {
        return issues;
      }

      issues.push(createIssue(this, entry,
        `The translation ends with "${transLast}", but the source ends with "${sourceLast}".`,
        {
          severity: 'info', // Lower severity for punctuation style differences
          context: `Punctuation mismatch: source="${sourceLast}", translation="${transLast}".`
        }
      ));
    }

    return issues;
  }
};

function isClosingBracket(char: string): boolean {
  return ')]}»›'.includes(char);
}

const QUOTE_CHARS = '"\'\u201c\u201d\u2018\u2019\u201e\u00bb\u00ab\u2039\u203a';
function isQuote(char: string): boolean {
  return QUOTE_CHARS.includes(char);
}
