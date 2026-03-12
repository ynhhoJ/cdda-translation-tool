#!/usr/bin/env bun
/**
 * CDDA Translation Tool
 *
 * Universal CLI for managing and validating CDDA translations.
 * Works with any language supported by Cataclysm: Dark Days Ahead.
 *
 * Commands:
 * - split: Split monolithic .po file by source path
 * - check: Run QA checks on .po files
 * - report / report:untranslated: Generate untranslated strings report
 * - sync-transifex: Sync changed translations to Transifex API
 */

import { runSplit } from './commands/split';
import { runCheck } from './commands/check';
import { runReportUntranslated } from './commands/report';
import { syncToTransifex } from './commands/sync-transifex';
import { runFixCommand } from './commands/fix';
import { runExtract } from './commands/extract';
import { runCommitPo } from './commands/commit-po';

const HELP = `
╔═══════════════════════════════════════════════════════════╗
║        CDDA Translation Tool                              ║
╚═══════════════════════════════════════════════════════════╝

Usage: bun run cli.ts <command> [options]

Commands:
  extract             Generate report + split PO file in one step  ← start here
  commit-po           Stage and commit the extracted translation files
  split               Split monolithic .po file by source path
  check               Run QA checks on .po files
  fix                 Auto-fix common translation issues in .po files
  report:untranslated Generate untranslated strings report
  sync-transifex      Sync changed translations to Transifex API

Examples:
  bun run cli.ts extract translations.po
  bun run cli.ts commit-po translations.po
  bun run cli.ts commit-po translations.po --dry-run
  bun run cli.ts split translations.po -o ./translations
  bun run cli.ts check translations.po --format all
  bun run cli.ts check translations.po --language de --format console
  bun run cli.ts fix translations.po --dry-run
  bun run cli.ts fix translations.po --backup
  bun run cli.ts report:untranslated translations.po
  bun run cli.ts sync-transifex --since HEAD~1
  bun run cli.ts sync-transifex --dry-run
  bun run cli.ts sync-transifex --yes           # skip interactive confirmation (CI)
  bun run cli.ts sync-transifex --force         # bypass regression safety block

Language:
  The language is inferred from the PO file header (Language: field).
  You can override it with --language / -l for the check command.
  For sync-transifex, set TRANSIFEX_LANGUAGE in your .env file.

Run '<command> --help' for detailed command options.
`;

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(HELP);
    process.exit(0);
  }

  const command = args[0];
  const commandArgs = args.slice(1);

  try {
    switch (command) {
      case 'extract':
        await runExtract(commandArgs);
        break;

      case 'commit-po':
        await runCommitPo(commandArgs);
        break;

      case 'split':
        await runSplit(commandArgs);
        break;

      case 'check':
        await runCheck(commandArgs);
        break;

      case 'fix':
        await runFixCommand(commandArgs);
        break;

      case 'report:untranslated':
      case 'report':
        await runReportUntranslated(commandArgs);
        break;

      case 'sync-transifex': {
        const dryRun = commandArgs.includes('--dry-run');
        const yes = commandArgs.includes('--yes') || commandArgs.includes('-y');
        const force = commandArgs.includes('--force');
        const sinceIndex = commandArgs.indexOf('--since');
        const since = sinceIndex >= 0 ? commandArgs[sinceIndex + 1] : undefined;
        await syncToTransifex({ since, dryRun, yes, force });
        break;
      }

      default:
        console.error(`❌ Unknown command: ${command}`);
        console.log(HELP);
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
