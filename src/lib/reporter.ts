/**
 * Report Generator - Creates markdown and console reports from QA issues
 */

import type { QaReport, QaIssue, Severity } from '../types';

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

const severityColors: Record<Severity, string> = {
  critical: colors.red,
  warning: colors.yellow,
  info: colors.blue,
};

const severityIcons: Record<Severity, string> = {
  critical: '🔴',
  warning: '🟡',
  info: '🔵',
};

/**
 * Generate a markdown report
 */
export function generateMarkdownReport(report: QaReport, groupByFile = false): string {
  const lines: string[] = [];

  lines.push('# CDDA Translation QA Report');
  lines.push('');
  lines.push(`**Generated:** ${report.timestamp}`);
  lines.push(`**Files checked:** ${report.files.join(', ')}`);
  lines.push(`**Total entries:** ${report.totalEntries}`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Severity | Count |`);
  lines.push(`|----------|-------|`);
  lines.push(`| 🔴 Critical | ${report.summary.critical} |`);
  lines.push(`| 🟡 Warning | ${report.summary.warning} |`);
  lines.push(`| 🔵 Info | ${report.summary.info} |`);
  lines.push(`| **Total** | **${report.issues.length}** |`);
  lines.push('');

  if (report.issues.length === 0) {
    lines.push('✅ **No issues found!**');
    return lines.join('\n');
  }

  if (groupByFile) {
    lines.push(...renderIssuesByFile(report.issues));
  } else {
    lines.push(...renderIssuesByCheck(report.issues));
  }

  // Detailed diff-style view for critical issues
  const critical = report.issues.filter(i => i.severity === 'critical');
  if (critical.length > 0) {
    lines.push('## Critical Issues (Diff View)');
    lines.push('');

    for (const issue of critical) {
      lines.push('```diff');
      lines.push(`# ${issue.checkName}: ${issue.message}`);
      lines.push(`# Reference: ${issue.reference}:${issue.lineNumber}`);
      lines.push(`- msgid: ${JSON.stringify(issue.msgid)}`);
      lines.push(`- msgstr: ${JSON.stringify(issue.msgstr)}`);
      if (issue.suggestion) {
        lines.push(`+ suggestion: ${JSON.stringify(issue.suggestion)}`);
      }
      lines.push('```');
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Generate a markdown report for a single file's issues
 */
export function generatePerFileMarkdownReport(filePath: string, issues: QaIssue[], timestamp: string): string {
  const lines: string[] = [];

  lines.push(`# QA Report: ${filePath}`);
  lines.push('');
  lines.push(`**Generated:** ${timestamp}`);
  lines.push(`**File:** \`${filePath}\``);
  lines.push('');

  const critical = issues.filter(i => i.severity === 'critical').length;
  const warning = issues.filter(i => i.severity === 'warning').length;
  const info = issues.filter(i => i.severity === 'info').length;

  lines.push('## Summary');
  lines.push('');
  lines.push(`| Severity | Count |`);
  lines.push(`|----------|-------|`);
  lines.push(`| 🔴 Critical | ${critical} |`);
  lines.push(`| 🟡 Warning | ${warning} |`);
  lines.push(`| 🔵 Info | ${info} |`);
  lines.push(`| **Total** | **${issues.length}** |`);
  lines.push('');

  if (issues.length === 0) {
    lines.push('✅ **No issues found!**');
    return lines.join('\n');
  }

  lines.push(...renderIssuesByCheck(issues));

  return lines.join('\n');
}

function renderIssuesByCheck(issues: QaIssue[]): string[] {
  const lines: string[] = [];
  const byCheck = groupBy(issues, i => i.checkId);

  lines.push('## Issues by Check');
  lines.push('');

  for (const [, checkIssues] of Object.entries(byCheck)) {
    const first = checkIssues[0]!;
    lines.push(`### ${first.checkName}`);
    lines.push('');
    lines.push(`_${checkIssues.length} issue(s)_`);
    lines.push('');

    for (const issue of checkIssues) {
      lines.push(`#### ${severityIcons[issue.severity]} ${issue.message}`);
      lines.push('');
      lines.push(`- **Reference:** \`${issue.reference}\` (line ${issue.lineNumber})`);
      lines.push(`- **Source:** \`${truncate(issue.msgid, 100)}\``);
      lines.push(`- **Translation:** \`${truncate(issue.msgstr, 100)}\``);
      if (issue.suggestion) {
        lines.push(`- **Suggestion:** \`${truncate(issue.suggestion, 100)}\``);
      }
      if (issue.context) {
        lines.push(`- **Context:** ${issue.context}`);
      }
      lines.push('');
    }
  }

  return lines;
}

function renderIssuesByFile(issues: QaIssue[]): string[] {
  const lines: string[] = [];
  const byFile = groupBy(issues, i => i.reference);

  lines.push('## Issues by File');
  lines.push('');

  for (const [file, fileIssues] of Object.entries(byFile).sort((a, b) => b[1].length - a[1].length)) {
    const critical = fileIssues.filter(i => i.severity === 'critical').length;
    const warning = fileIssues.filter(i => i.severity === 'warning').length;
    const info = fileIssues.filter(i => i.severity === 'info').length;

    lines.push(`### \`${file}\` (${fileIssues.length} issue(s))`);
    lines.push('');
    lines.push(`🔴 ${critical} critical · 🟡 ${warning} warning · 🔵 ${info} info`);
    lines.push('');

    for (const issue of fileIssues) {
      lines.push(`#### ${severityIcons[issue.severity]} ${issue.checkName}: ${issue.message}`);
      lines.push('');
      lines.push(`- **Line:** ${issue.lineNumber}`);
      lines.push(`- **Source:** \`${truncate(issue.msgid, 100)}\``);
      lines.push(`- **Translation:** \`${truncate(issue.msgstr, 100)}\``);
      if (issue.suggestion) {
        lines.push(`- **Suggestion:** \`${truncate(issue.suggestion, 100)}\``);
      }
      if (issue.context) {
        lines.push(`- **Context:** ${issue.context}`);
      }
      lines.push('');
    }
  }

  return lines;
}

/**
 * Generate console output with colors
 */
export function generateConsoleReport(report: QaReport): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(`${colors.bold}═══════════════════════════════════════════════════════${colors.reset}`);
  lines.push(`${colors.bold}  CDDA Translation QA Report${colors.reset}`);
  lines.push(`${colors.bold}═══════════════════════════════════════════════════════${colors.reset}`);
  lines.push('');
  lines.push(`${colors.gray}Generated: ${report.timestamp}${colors.reset}`);
  lines.push(`${colors.gray}Entries checked: ${report.totalEntries}${colors.reset}`);
  lines.push('');

  // Summary bar
  lines.push(`${colors.bold}Summary:${colors.reset}`);
  lines.push(`  ${colors.red}● Critical: ${report.summary.critical}${colors.reset}`);
  lines.push(`  ${colors.yellow}● Warning: ${report.summary.warning}${colors.reset}`);
  lines.push(`  ${colors.blue}● Info: ${report.summary.info}${colors.reset}`);
  lines.push('');

  if (report.issues.length === 0) {
    lines.push(`${colors.bold}${colors.cyan}✅ No issues found!${colors.reset}`);
    lines.push('');
    return lines.join('\n');
  }

  lines.push(`${colors.bold}───────────────────────────────────────────────────────${colors.reset}`);
  lines.push('');

  // Show issues grouped by severity
  for (const severity of ['critical', 'warning', 'info'] as Severity[]) {
    const issues = report.issues.filter(i => i.severity === severity);
    if (issues.length === 0) continue;

    const color = severityColors[severity];
    lines.push(`${color}${colors.bold}${severity.toUpperCase()} (${issues.length})${colors.reset}`);
    lines.push('');

    for (const issue of issues) { // Limit output
      lines.push(`  ${color}●${colors.reset} ${issue.message}`);
      lines.push(`    ${colors.gray}${issue.reference}:${issue.lineNumber}${colors.reset}`);
      lines.push(`    ${colors.gray}msgid: ${truncate(issue.msgid, 60)}${colors.reset}`);
      lines.push('');
    }
  }

  lines.push(`${colors.bold}═══════════════════════════════════════════════════════${colors.reset}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate JSON report
 */
export function generateJsonReport(report: QaReport): string {
  return JSON.stringify(report, null, 2);
}

// --- Helpers ---

function groupBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of arr) {
    const key = keyFn(item);
    if (!result[key]) {
      result[key] = [];
    }
    result[key].push(item);
  }
  return result;
}

function truncate(str: string, maxLen: number): string {
  if (!str || typeof str !== 'string') {
    return '';
  }
  const oneLine = str.replace(/\n/g, '\\n').replace(/`/g, "'");

  if (oneLine.length <= maxLen) {
    return oneLine;
  }

  return oneLine.slice(0, maxLen - 3) + '...';
}
