/**
 * PO File Types for CDDA Translation Tool
 */

export interface PoEntry {
  /** Source location comments (#:) */
  references: string[];
  /** Translator comments (#) */
  translatorComments: string[];
  /** Extracted comments (#.) */
  extractedComments: string[];
  /** Flags like fuzzy (#,) */
  flags: string[];
  /** Message context (msgctxt) */
  msgctxt?: string;
  /** Source string (msgid) */
  msgid: string;
  /** Plural source (msgid_plural) */
  msgid_plural?: string;
  /** Translation (msgstr) */
  msgstr: string;
  /** Plural translations (msgstr[n]) */
  msgstr_plural?: Record<number, string>;
  /** Line number in original file */
  lineNumber: number;
  /** Is this entry fuzzy? */
  isFuzzy: boolean;
  /** Is this entry untranslated? */
  isUntranslated: boolean;
}

export interface PoFile {
  /** File header with metadata */
  header: PoHeader;
  /** All translation entries */
  entries: PoEntry[];
  /** Original file path */
  filePath: string;
}

export interface PoHeader {
  projectIdVersion?: string;
  reportMsgidBugsTo?: string;
  potCreationDate?: string;
  poRevisionDate?: string;
  lastTranslator?: string;
  languageTeam?: string;
  language?: string;
  mimeVersion?: string;
  contentType?: string;
  contentTransferEncoding?: string;
  pluralForms?: string;
  /** Raw header string for preservation */
  raw: string;
}

export type Severity = 'critical' | 'warning' | 'info';

export interface QaIssue {
  /** Unique issue ID */
  id: string;
  /** Issue severity */
  severity: Severity;
  /** Check that found this issue */
  checkId: string;
  /** Human-readable check name */
  checkName: string;
  /** Issue description */
  message: string;
  /** Source file reference */
  reference: string;
  /** Line number in .po file */
  lineNumber: number;
  /** Original source string */
  msgid: string;
  /** Current translation */
  msgstr: string;
  /** Suggested fix (if available) */
  suggestion?: string;
  /** Context for AI assistant */
  context?: string;
}

export interface QaReport {
  /** Report generation timestamp */
  timestamp: string;
  /** Source file(s) checked */
  files: string[];
  /** Total entries checked */
  totalEntries: number;
  /** Issues by severity */
  summary: {
    critical: number;
    warning: number;
    info: number;
  };
  /** All issues found */
  issues: QaIssue[];
}

export interface SplitResult {
  /** Output directory */
  outputDir: string;
  /** Files created */
  files: Array<{
    path: string;
    entryCount: number;
  }>;
  /** Total entries processed */
  totalEntries: number;
}
