/**
 * Commit PO Command - Stage and commit extracted translation files.
 *
 * Reads the POT-Creation-Date from the given .po file, stages:
 *   - the input .po file itself
 *   - everything under ./reports/
 * Then creates a git commit with the message:
 *   "Extracted PO files <POT-Creation-Date>"
 */

import { spawnSync } from 'child_process';

const HELP = `
Usage: bun run cli.ts commit-po <input.po>

Stages the input .po file and the generated reports, then commits with the message:
  "Extracted PO files <POT-Creation-Date>"

The POT-Creation-Date is read from the input .po file header.

Options:
  -i, --input <file>   Input .po file (can also be the first positional argument)
  --dry-run            Preview the commit message and staged files without committing
  -h, --help           Show this help

Example:
  bun run cli.ts commit-po ./for_translation_cataclysm-dda_master-cataclysm-dda_ru.po
`;

function git(args: string[], cwd: string): { stdout: string; stderr: string; status: number } {
  const result = spawnSync('git', args, { encoding: 'utf-8', cwd });
  return {
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
    status: result.status ?? 1,
  };
}

function getGitRoot(): string {
  const result = git(['rev-parse', '--show-toplevel'], process.cwd());
  if (result.status !== 0) {
    throw new Error('Not inside a git repository. Please run this command from within the project folder.');
  }
  return result.stdout;
}

export async function runCommitPo(args: string[]): Promise<void> {
  let input = '';
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--help' || arg === '-h') {
      console.log(HELP);
      process.exit(0);
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if ((arg === '--input' || arg === '-i') && args[i + 1]) {
      input = args[++i]!;
    } else if (!arg.startsWith('-')) {
      input = arg;
    }
  }

  if (!input) {
    console.error('❌ Error: No input file specified.');
    console.log(HELP);
    process.exit(1);
  }

  // Read POT-Creation-Date directly from the raw file text.
  // (parsePo intentionally strips this field from header.raw to avoid noise
  // when re-serializing, so we extract it ourselves here.)
  let potCreationDate: string;
  try {
    const content = await Bun.file(input).text();
    const match = content.match(/^"POT-Creation-Date:\s*([^\\]+)/m);
    potCreationDate = match?.[1]?.trim() ?? '';
  } catch (err) {
    throw new Error(
      `Failed to read "${input}": ${err instanceof Error ? err.message : err}\n` +
      'Make sure the file exists and is a valid .po file.'
    );
  }

  if (!potCreationDate) {
    throw new Error(
      `No POT-Creation-Date found in "${input}".\n` +
      'The input file must have a POT-Creation-Date header field.'
    );
  }

  const commitMessage = `Extracted PO files ${potCreationDate}`;

  const gitRoot = getGitRoot();

  if (dryRun) {
    console.log('🔍 Dry run — no changes will be made.\n');
    console.log(`   Commit message : ${commitMessage}`);
    console.log(`   Will stage     : ./reports/`);
    process.exit(0);
  }

  console.log('📦 CDDA Translation Commit');
  console.log(`   Input file: ${input}`);
  console.log(`   Date      : ${potCreationDate}`);
  console.log('');

  // Stage the reports directory
  const addReports = git(['add', './reports/'], gitRoot);
  if (addReports.status !== 0) {
    throw new Error(`git add failed for "./reports/":\n${addReports.stderr}`);
  }
  console.log('✅ Staged: ./reports/');

  // Check if there is anything to commit
  const status = git(['diff', '--cached', '--quiet'], gitRoot);
  if (status.status === 0) {
    console.log('\nℹ️  Nothing to commit — all staged files are unchanged.');
    process.exit(0);
  }

  // Commit
  const commit = git(['commit', '-m', commitMessage], gitRoot);
  if (commit.status !== 0) {
    throw new Error(`git commit failed:\n${commit.stderr}`);
  }

  console.log(`\n✅ Committed: "${commitMessage}"`);
  if (commit.stdout) {
    console.log(commit.stdout);
  }
}
