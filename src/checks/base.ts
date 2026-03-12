/**
 * QA Check Base Types and Interface
 */

import type { PoEntry, QaIssue, Severity } from '../types';

export interface QaCheckResult {
  passed: boolean;
  issues: QaIssue[];
}

export interface QaCheck {
  /** Unique check identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what this check does */
  description: string;
  /** Default severity for issues from this check */
  defaultSeverity: Severity;
  /** Run the check on a single entry */
  check(entry: PoEntry, context?: QaContext): QaIssue[];
}

export interface QaContext {
  /** Language code (e.g., 'ru', 'de', 'fr') */
  language: string;
  /** All entries (for cross-reference checks) */
  allEntries?: PoEntry[];
  /** Source file path */
  filePath?: string;
}

let issueCounter = 0;

/**
 * Helper to create a QA issue
 */
export function createIssue(
  check: QaCheck,
  entry: PoEntry,
  message: string,
  options: {
    severity?: Severity;
    suggestion?: string;
    context?: string;
  } = {}
): QaIssue {
  return {
    id: `${check.id}-${++issueCounter}`,
    severity: options.severity ?? check.defaultSeverity,
    checkId: check.id,
    checkName: check.name,
    message,
    reference: entry.references[0] || 'unknown',
    lineNumber: entry.lineNumber,
    msgid: entry.msgid,
    msgstr: entry.msgstr,
    suggestion: options.suggestion,
    context: options.context
  };
}

/**
 * Reset issue counter (for testing)
 */
export function resetIssueCounter(): void {
  issueCounter = 0;
}
