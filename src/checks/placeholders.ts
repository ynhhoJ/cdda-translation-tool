/**
 * Placeholder Check - Validates printf-style placeholders
 *
 * Based on Poedit's qa_checks.cpp Placeholders check
 */

import type { PoEntry, QaIssue } from '../types';
import type { QaCheck, QaContext } from './base';
import { createIssue } from './base';

// Matches printf-style placeholders: %s, %d, %1$s, %2$d, etc.
// Note: space is excluded from flag characters to avoid false positives like "50% closer" → "% c".
// Note: {key:value} patterns (e.g. game search filters like {c:books}) are excluded by requiring no colon inside braces.
const PLACEHOLDER_REGEX = /(%(?:\d+\$)?[-+0#]*\d*(?:\.\d+)?[hlL]?[diouxXeEfFgGaAcspn%])|(%[sd])|(\{[^}:]+\})|(<[^>]+>)/g;

// Positional format: %1$s -> %s
const POSITIONAL_REGEX = /^%(\d+)\$(.*)$/;

export const placeholderCheck: QaCheck = {
  id: 'placeholders',
  name: 'Placeholder Validation',
  description: 'Checks that all placeholders in source appear in translation and vice versa',
  defaultSeverity: 'critical',

  check(entry: PoEntry, _context?: QaContext): QaIssue[] {
    const issues: QaIssue[] = [];

    // Skip untranslated entries
    if (entry.isUntranslated) {
      return issues;
    }

    // Extract placeholders from source and translation
    const sourcePh = extractPlaceholders(entry.msgid);

    // Also check plural source if present
    if (entry.msgid_plural) {
      const pluralPh = extractPlaceholders(entry.msgid_plural);
      for (const ph of pluralPh) {
        sourcePh.add(ph);
      }
    }

    // Check msgstr or msgstr_plural
    if (entry.msgstr_plural) {
      // Check each plural form
      for (const [index, translation] of Object.entries(entry.msgstr_plural)) {
        if (translation === '') continue;

        const transPh = extractPlaceholders(translation);
        const checkIssues = comparePlaceholders(sourcePh, transPh, entry, this, parseInt(index, 10));
        issues.push(...checkIssues);
      }
    } else {
      const transPh = extractPlaceholders(entry.msgstr);
      const checkIssues = comparePlaceholders(sourcePh, transPh, entry, this);
      issues.push(...checkIssues);
    }

    return issues;
  }
};

function extractPlaceholders(text: string): Set<string> {
  const placeholders = new Set<string>();

  let match;
  while ((match = PLACEHOLDER_REGEX.exec(text)) !== null) {
    let ph = match[0];

    // Skip escaped %%
    if (ph === '%%') continue;

    // Normalize positional arguments: %1$s -> %s
    const posMatch = ph.match(POSITIONAL_REGEX);
    if (posMatch) {
      ph = '%' + posMatch[2];
    }

    placeholders.add(ph);
  }

  // Reset regex lastIndex
  PLACEHOLDER_REGEX.lastIndex = 0;

  return placeholders;
}

function comparePlaceholders(
  source: Set<string>,
  translation: Set<string>,
  entry: PoEntry,
  check: QaCheck,
  pluralIndex?: number
): QaIssue[] {
  const issues: QaIssue[] = [];

  // Check for missing placeholders in translation
  for (const ph of source) {
    if (!translation.has(ph)) {
      // Special case: allow missing placeholders in first plural form (n=1)
      // because translators often write "One item" instead of "%d items"
      if (pluralIndex === 0) continue;

      issues.push(createIssue(check, entry,
        `Placeholder "${ph}" is missing from translation${pluralIndex !== undefined ? ` (plural form ${pluralIndex})` : ''}.`,
        {
          context: `Source has placeholder ${ph} but translation doesn't. ` +
            `This will cause runtime errors or incorrect output.`
        }
      ));
    }
  }

  // Check for extra placeholders in translation
  for (const ph of translation) {
    if (!source.has(ph)) {
      issues.push(createIssue(check, entry,
        `Superfluous placeholder "${ph}" in translation that isn't in source.`,
        {
          context: `Translation has placeholder ${ph} but source doesn't. ` +
            `This may cause runtime errors.`
        }
      ));
    }
  }

  return issues;
}
