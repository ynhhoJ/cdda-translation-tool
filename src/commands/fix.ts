/**
 * Auto-Fix Command - Apply automatic fixes for common translation issues
 *
 * Fixable issues (those with a `suggestion` produced by a check):
 *   - whitespace: leading/trailing space and newline mismatches
 *   - punctuation: missing or extra ending punctuation
 *
 * Placeholder issues are intentionally NOT auto-fixed — they are critical
 * errors that require translator attention.
 */

import { glob } from 'glob';
import { parsePo, serializePo } from '../lib/po-parser';
import { getChecksForLanguage } from '../checks';
import { copyFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { PoEntry, QaIssue } from '../types';
import type { QaContext } from '../checks/base';

// Checks that are safe to auto-fix (they always provide a reliable suggestion)
const AUTO_FIXABLE_CHECK_IDS = new Set(['whitespace', 'punctuation']);

interface FixOptions {
  input: string | string[];
  language?: string;
  dryRun?: boolean;
  backup?: boolean;
  checks?: string[];
  verbose?: boolean;
}

interface FixSummary {
  filesScanned: number;
  filesModified: number;
  fixesApplied: number;
  fixesSkipped: number;
  byCheck: Record<string, number>;
}

export async function runFix(options: FixOptions): Promise<FixSummary> {
  const {
    input,
    language = '',
    dryRun = false,
    backup = false,
    checks: enabledCheckIds,
    verbose = false,
  } = options;

  const log = verbose ? console.log : () => {};

  // Resolve input files
  const inputs = Array.isArray(input) ? input : [input];
  const files: string[] = [];

  for (const pattern of inputs) {
    if (pattern.includes('*')) {
      const matches = await glob(pattern);
      files.push(...matches.sort());
    } else {
      files.push(pattern);
    }
  }

  console.log(`🔍 Scanning ${files.length} file(s)${dryRun ? ' (dry run — no files will be changed)' : ''}...\n`);

  // Infer language from first file if not provided
  let effectiveLanguage = language;
  if (!effectiveLanguage && files.length > 0) {
    try {
      const firstContent = await Bun.file(files[0]!).text();
      const firstPo = parsePo(firstContent, files[0]!);
      effectiveLanguage = firstPo.header.language || '';
      if (effectiveLanguage) {
        log(`📍 Inferred language: ${effectiveLanguage}`);
      }
    } catch {
      // fall through
    }
  }

  // Determine which checks to run — only auto-fixable ones
  let checksToRun = getChecksForLanguage(effectiveLanguage)
    .filter(c => AUTO_FIXABLE_CHECK_IDS.has(c.id));

  if (enabledCheckIds && enabledCheckIds.length > 0) {
    checksToRun = checksToRun.filter(c => enabledCheckIds.includes(c.id));
  }

  if (checksToRun.length === 0) {
    console.log('⚠️  No auto-fixable checks selected.');
    return { filesScanned: files.length, filesModified: 0, fixesApplied: 0, fixesSkipped: 0, byCheck: {} };
  }

  log(`🔧 Auto-fixable checks: ${checksToRun.map(c => c.id).join(', ')}`);

  const summary: FixSummary = {
    filesScanned: files.length,
    filesModified: 0,
    fixesApplied: 0,
    fixesSkipped: 0,
    byCheck: {},
  };

  for (const file of files) {
    log(`\n  📖 ${file}`);

    const content = await Bun.file(file).text();
    const poFile = parsePo(content, file);

    const context: QaContext = {
      language: effectiveLanguage,
      allEntries: poFile.entries,
      filePath: file,
    };

    let fileModified = false;
    const fileFixLog: string[] = [];

    for (const entry of poFile.entries) {
      // Collect all fixable issues for this entry across all checks
      const issuesForEntry: QaIssue[] = [];

      for (const check of checksToRun) {
        const issues = check.check(entry, context);
        // Only keep issues that have a suggestion — those are the auto-fixable ones
        issuesForEntry.push(...issues.filter(i => i.suggestion !== undefined));
      }

      if (issuesForEntry.length === 0) continue;

      // Apply fixes: each issue's suggestion replaces the translation.
      // When multiple issues exist for one entry, apply them in order.
      // Because each suggestion is based on the *original* msgstr, we need
      // to pick the last suggestion that is "most complete" — in practice
      // the checks are independent dimensions (leading WS, trailing WS,
      // trailing newline, trailing punct) so we apply all of them
      // sequentially to the running value.
      let current = entry.msgstr;
      const applied: QaIssue[] = [];

      for (const issue of issuesForEntry) {
        const fixed = applyFix(current, entry, issue);
        if (fixed !== null && fixed !== current) {
          current = fixed;
          applied.push(issue);
        } else {
          summary.fixesSkipped++;
        }
      }

      if (applied.length === 0) continue;

      // Record the fix
      for (const issue of applied) {
        summary.fixesApplied++;
        summary.byCheck[issue.checkId] = (summary.byCheck[issue.checkId] ?? 0) + 1;

        const logLine = `    ✓ [${issue.checkId}] line ${entry.lineNumber}: ${issue.message}`;
        fileFixLog.push(logLine);
        if (dryRun || verbose) {
          console.log(logLine);
          if (dryRun) {
            console.log(`      before: ${JSON.stringify(entry.msgstr)}`);
            console.log(`      after:  ${JSON.stringify(current)}`);
          }
        }
      }

      // Mutate the entry in-place so serializePo picks it up
      entry.msgstr = current;
      fileModified = true;
    }

    if (!fileModified) {
      log(`  ✅ No fixable issues`);
      continue;
    }

    summary.filesModified++;

    if (!dryRun) {
      // Write backup before modifying
      if (backup) {
        const backupPath = file + '.bak';
        mkdirSync(dirname(backupPath), { recursive: true });
        copyFileSync(file, backupPath);
        log(`  💾 Backup: ${backupPath}`);
      }

      const fixed = serializePo(poFile);
      await Bun.write(file, fixed);
      console.log(`  💾 Fixed ${fileFixLog.length} issue(s) in ${file}`);
    } else {
      console.log(`  [dry run] Would fix ${fileFixLog.length} issue(s) in ${file}`);
    }
  }

  return summary;
}

/**
 * Given the current msgstr value and an issue, compute the fixed string.
 * Returns null if the fix cannot be determined.
 */
function applyFix(current: string, _entry: PoEntry, issue: QaIssue): string | null {
  if (issue.suggestion === undefined) return null;

  // The suggestion from each check is always computed from the *original* entry.msgstr.
  // When multiple fixes chain (e.g. trailing space + trailing newline), we need to
  // re-derive what the suggestion *would* be against `current` rather than the original.
  // We do this by re-applying the same transformation the check applied.

  switch (issue.checkId) {
    case 'whitespace': {
      if (issue.message.includes("missing whitespace at the end")) {
        // Add trailing space if not already there
        return current.endsWith(' ') ? current : current.trimEnd() + ' ';
      }
      if (issue.message.includes("ends with whitespace, but the source doesn't")) {
        return current.trimEnd();
      }
      if (issue.message.includes("missing a newline at the end")) {
        return current.endsWith('\n') ? current : current + '\n';
      }
      if (issue.message.includes("ends with a newline, but the source doesn't")) {
        return current.replace(/\n+$/, '');
      }
      if (issue.message.includes("doesn't start with whitespace, but the source does")) {
        return current.startsWith(' ') ? current : ' ' + current.trimStart();
      }
      if (issue.message.includes("starts with whitespace, but the source doesn't")) {
        return current.trimStart();
      }
      return null;
    }

    case 'punctuation': {
      if (issue.message.includes("should end with")) {
        // Extract the expected punctuation char from the message
        const match = issue.message.match(/should end with "(.+?)"/);
        if (!match) return null;
        const expectedChar = match[1]!;
        const trimmed = current.trimEnd();
        return trimmed.endsWith(expectedChar) ? current : trimmed + expectedChar;
      }
      if (issue.message.includes("should not end with")) {
        // Strip the last punctuation character
        const trimmed = current.trimEnd();
        return trimmed.slice(0, -1);
      }
      if (issue.message.includes("ends with") && issue.message.includes("but the source ends with")) {
        // Mismatched punctuation — replace the last char
        const match = issue.message.match(/source ends with "(.+?)"/);
        if (!match) return null;
        const expectedChar = match[1]!;
        const trimmed = current.trimEnd();
        return trimmed.slice(0, -1) + expectedChar;
      }
      return null;
    }

    default:
      return null;
  }
}

// CLI handler
export async function runFixCommand(args: string[]): Promise<void> {
  const options: FixOptions = {
    input: [],
    language: '',
    dryRun: false,
    backup: false,
    checks: [],
    verbose: false,
  };

  const inputs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--input' || arg === '-i') {
      inputs.push(args[++i] ?? '');
    } else if (arg === '--language' || arg === '-l') {
      options.language = args[++i] ?? '';
    } else if (arg === '--dry-run' || arg === '-n') {
      options.dryRun = true;
    } else if (arg === '--backup' || arg === '-b') {
      options.backup = true;
    } else if (arg === '--check' || arg === '-c') {
      options.checks!.push(args[++i] ?? '');
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (!arg.startsWith('-')) {
      inputs.push(arg);
    }
  }

  if (inputs.length === 0) {
    console.error('❌ Error: No input file(s) specified');
    console.log('\nUsage: bun fix [options] <files...>');
    console.log('\nOptions:');
    console.log('  -i, --input <file>    Input .po file or glob pattern');
    console.log('  -l, --language <code> Language code (inferred from PO header if omitted)');
    console.log('  -n, --dry-run         Show what would be fixed without writing files');
    console.log('  -b, --backup          Write a .bak copy before modifying each file');
    console.log('  -c, --check <id>      Limit fixes to a specific check (can repeat)');
    console.log('  -v, --verbose         Verbose output');
    console.log('\nAuto-fixable checks:');
    console.log('  whitespace            Fix leading/trailing whitespace and newline mismatches');
    console.log('  punctuation           Fix missing or extra ending punctuation');
    process.exit(1);
  }

  options.input = inputs;

  console.log('🔧 CDDA Translation Auto-Fixer\n');

  const summary = await runFix(options);

  console.log('\n' + '═'.repeat(55));
  console.log('  Summary');
  console.log('═'.repeat(55));
  console.log(`  Files scanned:   ${summary.filesScanned}`);
  console.log(`  Files modified:  ${summary.filesModified}${options.dryRun ? ' (dry run)' : ''}`);
  console.log(`  Fixes applied:   ${summary.fixesApplied}`);
  if (summary.fixesSkipped > 0) {
    console.log(`  Fixes skipped:   ${summary.fixesSkipped}`);
  }
  if (Object.keys(summary.byCheck).length > 0) {
    console.log('');
    for (const [checkId, count] of Object.entries(summary.byCheck)) {
      console.log(`    ${checkId.padEnd(16)} ${count} fix(es)`);
    }
  }
  console.log('');
}
