/**
 * Split Command - Split monolithic .po file by source path
 */

import { mkdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { parsePo, serializePo, groupEntriesBySource } from '../lib/po-parser';
import type { PoFile, SplitResult } from '../types';

interface SplitOptions {
  input: string;
  output: string;
  maxEntriesPerFile?: number;
  verbose?: boolean;
}

/**
 * Split a monolithic .po file into smaller files by source path
 */
export async function split(options: SplitOptions): Promise<SplitResult> {
  const { input, output, maxEntriesPerFile = 500, verbose = false } = options;

  const log = verbose ? console.log : () => {};

  log(`📖 Reading ${input}...`);
  const content = await Bun.file(input).text();
  const poFile = parsePo(content, input);

  log(`📊 Found ${poFile.entries.length} entries`);

  // Group by source path
  const groups = groupEntriesBySource(poFile.entries);
  log(`📁 Grouped into ${groups.size} source paths`);

  const result: SplitResult = {
    outputDir: output,
    files: [],
    totalEntries: poFile.entries.length
  };

  // Create output directory
  await mkdir(output, { recursive: true });

  // Write each group to its own file
  for (const [sourcePath, entries] of groups) {
    // Convert source path to output path
    // e.g., "data/json/furniture.json" -> "data/json/furniture.po"
    let outputPath = sourcePath.replace(/\.json$/, '.po');

    if (outputPath === 'unknown') {
      outputPath = '_unknown.po';
    }

    // Prevent path traversal from PO reference comments
    outputPath = outputPath.replace(/\.\.[\/\\]/g, '');

    // If too many entries, split further
    const chunks = chunkEntries(entries, maxEntriesPerFile);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      const finalPath = chunks.length > 1
        ? outputPath.replace('.po', `_part${i + 1}.po`)
        : outputPath;

      const fullPath = join(output, finalPath);

      // Create directory structure if needed
      await mkdir(dirname(fullPath), { recursive: true });

      // Create the split .po file
      const splitFile: PoFile = {
        header: poFile.header,
        entries: chunk,
        filePath: fullPath
      };

      const serialized = serializePo(splitFile);
      await Bun.write(fullPath, serialized);

      result.files.push({
        path: relative(output, fullPath) || finalPath,
        entryCount: chunk.length
      });

      log(`  ✅ ${finalPath} (${chunk.length} entries)`);
    }
  }

  return result;
}

function chunkEntries<T>(arr: T[], size: number): T[][] {
  if (arr.length <= size) {
    return [arr];
  }

  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// CLI handler
export async function runSplit(args: string[]): Promise<void> {
  const options: SplitOptions = {
    input: '',
    output: './translations',
    verbose: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--input' || arg === '-i') {
      options.input = args[++i] ?? '';
    } else if (arg === '--output' || arg === '-o') {
      options.output = args[++i] ?? './translations';
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--max-entries') {
      options.maxEntriesPerFile = parseInt(args[++i] ?? '500', 10);
    } else if (!arg.startsWith('-')) {
      options.input = arg;
    }
  }

  if (!options.input) {
    console.error('❌ Error: No input file specified');
    console.log('\nUsage: bun split [options] <input.po>');
    console.log('\nOptions:');
    console.log('  -i, --input <file>     Input .po file');
    console.log('  -o, --output <dir>     Output directory (default: ./translations)');
    console.log('  --max-entries <n>      Max entries per file (default: 500)');
    console.log('  -v, --verbose          Verbose output');
    process.exit(1);
  }

  console.log('🔀 CDDA Translation File Splitter\n');

  const result = await split(options);

  console.log('\n📋 Summary:');
  console.log(`   Total entries: ${result.totalEntries}`);
  console.log(`   Files created: ${result.files.length}`);
  console.log(`   Output dir: ${result.outputDir}`);
}
