/**
 * Check Command - Run QA checks on .po files
 */

import { glob } from 'glob';
import { parsePo } from '../lib/po-parser';
import { generateMarkdownReport, generateConsoleReport, generateJsonReport, generatePerFileMarkdownReport } from '../lib/reporter';
import { getChecksForLanguage, allChecks } from '../checks';
import type { PoEntry, QaIssue, QaReport, Severity } from '../types';
import type { QaCheck, QaContext } from '../checks/base';
import { resetIssueCounter } from '../checks/base';
import { openSync, writeSync, closeSync, mkdirSync } from 'fs';
import { dirname } from 'path';

interface CheckOptions {
  input: string | string[];
  output?: string;
  language?: string;
  format?: 'console' | 'markdown' | 'json' | 'all';
  verbose?: boolean;
  checks?: string[];
  groupByFile?: boolean;
  perFile?: boolean;
}

/**
 * Run QA checks on .po files
 */
export async function check(options: CheckOptions): Promise<QaReport> {
  const {
    input,
    output = './reports',
    language = '',
    format = 'console',
    verbose = false,
    checks: enabledCheckIds,
    groupByFile = false,
    perFile = false,
  } = options;

  const log = verbose ? console.log : () => {};

  // Resolve input files
  const inputs = Array.isArray(input) ? input : [input];
  const files: string[] = [];

  for (const pattern of inputs) {
    if (pattern.includes('*')) {
      const matches = await glob(pattern);
      files.push(...matches);
    } else {
      files.push(pattern);
    }
  }

  // Reset issue counter for fresh IDs each run
  resetIssueCounter();

  log(`📂 Found ${files.length} file(s) to check`);

  // Determine effective language: use explicit option, or infer from first PO header
  let effectiveLanguage = language;
  if (!effectiveLanguage && files.length > 0) {
    try {
      const firstContent = await Bun.file(files[0]!).text();
      const firstPo = parsePo(firstContent, files[0]!);
      effectiveLanguage = firstPo.header.language || '';
      if (effectiveLanguage) {
        log(`📍 Inferred language from PO header: ${effectiveLanguage}`);
      }
    } catch {
      // If we can't read the first file here, it'll fail again in the loop below
    }
  }

  // Get checks to run
  let checksToRun = getChecksForLanguage(effectiveLanguage);
  if (enabledCheckIds && enabledCheckIds.length > 0) {
    checksToRun = checksToRun.filter(c => enabledCheckIds.includes(c.id));
  }

  log(`🔍 Running ${checksToRun.length} check(s): ${checksToRun.map(c => c.id).join(', ')}`);

  // Setup streaming markdown writer if needed
  let mdFd: number | null = null;
  let mdPath: string | null = null;

  if (format === 'markdown' || format === 'all') {
    mdPath = `${output}/qa-report.md`;
    try {
      mkdirSync(dirname(mdPath), { recursive: true });
    } catch {}
    mdFd = openSync(mdPath, 'w');

    // Write markdown header
    const header = [
      '# CDDA Translation QA Report',
      '',
      `**Generated:** ${new Date().toISOString()}`,
      `**Files:** ${files.join(', ')}`,
      '',
      '## Progress',
      '',
      '_Checking in progress..._',
      '',
      '## Issues',
      '',
    ].join('\n');
    writeSync(mdFd, header);
    log(`📝 Writing live report to: ${mdPath}`);
  }

  // Run checks
  const allIssues: QaIssue[] = [];
  const issuesByFile: Map<string, QaIssue[]> = new Map();
  let totalEntries = 0;

  for (const file of files) {
    log(`  📖 Checking ${file}...`);

    const content = await Bun.file(file).text();
    const poFile = parsePo(content, file);

    totalEntries += poFile.entries.length;

    const context: QaContext = {
      language: effectiveLanguage,
      allEntries: poFile.entries,
      filePath: file
    };

    const fileIssues: QaIssue[] = [];

    for (const entry of poFile.entries) {
      for (const check of checksToRun) {
        const issues = check.check(entry, context);

        // Write issues to markdown immediately
        if (mdFd !== null && issues.length > 0) {
          for (const issue of issues) {
            const icon = issue.severity === 'critical' ? '🔴' : issue.severity === 'warning' ? '🟡' : '🔵';
            const issueText = [
              `### ${icon} ${issue.checkName}: ${issue.message}`,
              '',
              `- **Reference:** \`${issue.reference}\` (line ${issue.lineNumber})`,
              `- **Source:** \`${truncateForMd(issue.msgid)}\``,
              `- **Translation:** \`${truncateForMd(issue.msgstr)}\``,
              issue.suggestion ? `- **Suggestion:** ${issue.suggestion}` : null,
              issue.context ? `- **Context:** ${issue.context}` : null,
              '',
            ].filter(Boolean).join('\n');
            writeSync(mdFd, issueText + '\n');
          }
        }

        fileIssues.push(...issues);
        allIssues.push(...issues);
      }
    }

    if (fileIssues.length > 0) {
      issuesByFile.set(file, fileIssues);
    }
  }

  // Close markdown file if open
  if (mdFd !== null) {
    const footer = [
      '',
      '---',
      '',
      '## Summary',
      '',
      `- **Total entries checked:** ${totalEntries}`,
      `- **Total issues found:** ${allIssues.length}`,
      `- 🔴 Critical: ${allIssues.filter(i => i.severity === 'critical').length}`,
      `- 🟡 Warning: ${allIssues.filter(i => i.severity === 'warning').length}`,
      `- 🔵 Info: ${allIssues.filter(i => i.severity === 'info').length}`,
      '',
    ].join('\n');
    writeSync(mdFd, footer);
    closeSync(mdFd);
    log(`✅ Markdown report completed: ${mdPath}`);
  }

  // Build report
  const report: QaReport = {
    timestamp: new Date().toISOString(),
    files,
    totalEntries,
    summary: {
      critical: allIssues.filter(i => i.severity === 'critical').length,
      warning: allIssues.filter(i => i.severity === 'warning').length,
      info: allIssues.filter(i => i.severity === 'info').length,
    },
    issues: allIssues
  };

  // Output report
  if (format === 'console' || format === 'all') {
    console.log(generateConsoleReport(report));
  }

  // Markdown was already written incrementally, skip here

  if (format === 'json' || format === 'all') {
    const jsonReport = generateJsonReport(report);
    const jsonPath = `${output}/qa-report.json`;
    await Bun.write(jsonPath, jsonReport);
    log(`📄 JSON report: ${jsonPath}`);
  }

  // Generate grouped-by-file markdown report
  if (groupByFile && (format === 'markdown' || format === 'all')) {
    const md = generateMarkdownReport(report, true);
    const path = `${output}/qa-report-by-file.md`;
    await Bun.write(path, md);
    console.log(`📝 Grouped-by-file report saved to: ${path}`);
  }

  // Generate per-file individual markdown reports
  if (perFile && issuesByFile.size > 0) {
    const perFileDir = `${output}/per-file`;
    let count = 0;
    for (const [file, issues] of issuesByFile) {
      // Mirror the input file path under the per-file output directory,
      // replacing the .po extension with .md
      const sanitized = file.replace(/\.po$/, '').replace(/[^a-zA-Z0-9_\-./]/g, '_');
      const outPath = `${perFileDir}/${sanitized}.md`;
      const outDir = outPath.substring(0, outPath.lastIndexOf('/'));
      mkdirSync(outDir, { recursive: true });
      const md = generatePerFileMarkdownReport(file, issues, report.timestamp);
      await Bun.write(outPath, md);
      log(`  ✓ ${outPath}`);
      count++;
    }
    console.log(`📂 Per-file reports (${count} file(s)) saved to: ${perFileDir}/`);
  }

  return report;
}

/**
 * Truncate and sanitize text for inline markdown code blocks
 */
function truncateForMd(text: string | undefined, maxLen = 100): string {
  if (!text) return '';
  const sanitized = text.replace(/`/g, "'");
  if (sanitized.length <= maxLen) return sanitized;
  return sanitized.substring(0, maxLen) + '...';
}

// CLI handler
export async function runCheck(args: string[]): Promise<void> {
  const options: CheckOptions = {
    input: [],
    output: './reports',
    language: '',
    format: 'console',
    verbose: false,
    checks: [],
    groupByFile: false,
    perFile: false,
  };

  const inputs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--input' || arg === '-i') {
      inputs.push(args[++i] ?? '');
    } else if (arg === '--output' || arg === '-o') {
      options.output = args[++i] ?? './reports';
    } else if (arg === '--language' || arg === '-l') {
      options.language = args[++i] ?? '';
    } else if (arg === '--format' || arg === '-f') {
      options.format = (args[++i] ?? 'console') as CheckOptions['format'];
    } else if (arg === '--check' || arg === '-c') {
      options.checks!.push(args[++i] ?? '');
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--all') {
      options.format = 'all';
    } else if (arg === '--group-by-file' || arg === '-G') {
      options.groupByFile = true;
    } else if (arg === '--per-file' || arg === '-P') {
      options.perFile = true;
    } else if (!arg.startsWith('-')) {
      inputs.push(arg);
    }
  }

  if (inputs.length === 0) {
    console.error('❌ Error: No input file(s) specified');
    console.log('\nUsage: bun check [options] <files...>');
    console.log('\nOptions:');
    console.log('  -i, --input <file>     Input .po file or glob pattern');
    console.log('  -o, --output <dir>     Output directory (default: ./reports)');
    console.log('  -l, --language <code>  Language code (inferred from PO header if omitted)');
    console.log('  -f, --format <fmt>     Output format: console, markdown, json, all');
    console.log('  -c, --check <id>       Run specific check (can repeat)');
    console.log('  -G, --group-by-file    Group issues by source file in markdown report');
    console.log('  -P, --per-file         Generate a separate .md report for each file with issues');
    console.log('  -v, --verbose          Verbose output');
    console.log('\nAvailable checks:');
    for (const c of allChecks) {
      console.log(`  ${c.id.padEnd(20)} ${c.description}`);
    }
    process.exit(1);
  }

  options.input = inputs;

  console.log('🔍 CDDA Translation QA Checker\n');

  await check(options);
}
