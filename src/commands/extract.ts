/**
 * Extract Command - Generate untranslated report + split PO file in one step.
 *
 * Combines `report:untranslated` and `split` into a single command.
 * The user only needs to supply the input .po file; all output paths are fixed.
 */

import { reportUntranslated } from './report';
import { split } from './split';

const REPORT_OUTPUT = './reports/untranslated';
const SPLIT_OUTPUT = './reports/c-dda';

const HELP = `
Usage: bun run cli.ts extract <input.po>

Runs two steps automatically:
  1. Generates a Markdown untranslated strings report → ${REPORT_OUTPUT}/
  2. Splits the PO file by source path             → ${SPLIT_OUTPUT}/

Options:
  -i, --input <file>   Input .po file (can also be the first positional argument)
  -h, --help           Show this help

Example:
  bun run cli.ts extract ./for_translation_cataclysm-dda_master-cataclysm-dda_ru.po
`;

export async function runExtract(args: string[]): Promise<void> {
  let input = '';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--help' || arg === '-h') {
      console.log(HELP);
      process.exit(0);
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

  console.log('🚀 CDDA Translation Extract');
  console.log(`   Input  : ${input}`);
  console.log(`   Reports: ${REPORT_OUTPUT}`);
  console.log(`   Split  : ${SPLIT_OUTPUT}`);
  console.log('');

  // Step 1: Generate untranslated report
  console.log('─── Step 1/2: Generating untranslated report ───');
  await reportUntranslated({
    input,
    output: REPORT_OUTPUT,
    format: 'markdown',
    groupBy: 'source',
  });

  // Step 2: Split PO file by source path
  console.log('\n─── Step 2/2: Splitting PO file ───');
  const result = await split({ input, output: SPLIT_OUTPUT });

  console.log(`\n✅ Done!`);
  console.log(`   Report : ${REPORT_OUTPUT}/untranslated-report.md`);
  console.log(`   Split  : ${result.files.length} files in ${SPLIT_OUTPUT}`);
  console.log('');
  console.log('Next step: run  bun run commit-po <input.po>  to commit the results.');
}
