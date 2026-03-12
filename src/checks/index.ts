/**
 * QA Checks Index - Core language-agnostic checks
 */

export * from './base';
export { placeholderCheck } from './placeholders';
export { whitespaceCheck } from './whitespace';
export { punctuationCheck } from './punctuation';

import type { QaCheck } from './base';
import { placeholderCheck } from './placeholders';
import { whitespaceCheck } from './whitespace';
import { punctuationCheck } from './punctuation';

/**
 * Core QA checks — language-agnostic, suitable for any CDDA translation.
 *
 * Covers:
 * - placeholders: printf-style (%s/%d) and CDDA tag (<npcname>) preservation
 * - whitespace: leading/trailing space consistency
 * - punctuation: ending punctuation consistency
 *
 * Additional language-specific checks can be added by consumers.
 */
export const coreChecks: QaCheck[] = [
  placeholderCheck,
  whitespaceCheck,
  punctuationCheck,
];

/**
 * All available checks (alias for coreChecks — extensible by consumers)
 */
export const allChecks: QaCheck[] = [...coreChecks];

/**
 * Get checks to run for a given language.
 * Returns the core checks for any language.
 * Consumers can extend this by pushing additional checks to the returned array.
 */
export function getChecksForLanguage(_language: string): QaCheck[] {
  return [...coreChecks];
}
