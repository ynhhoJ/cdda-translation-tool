/**
 * Untranslated Report Command - Generate report of untranslated strings
 */

import { glob } from 'glob';
import { parsePo, extractSourcePath } from '../lib/po-parser';
import { inferPluralCount } from '../lib/plural-forms';
import type { PoEntry } from '../types';

interface ReportOptions {
  input: string | string[];
  output?: string;
  format?: 'console' | 'markdown' | 'json';
  verbose?: boolean;
  groupBy?: 'file' | 'source' | 'none';
}

interface ModStats {
  modName: string;
  displayName: string;
  totalEntries: number;
  pendingCount: number;
  percentage: number;
  /** source path → pending entries for this mod */
  groups: Record<string, UntranslatedEntry[]>;
}

interface UntranslatedReport {
  timestamp: string;
  files: string[];
  totalEntries: number;
  untranslatedCount: number;
  fuzzyCount: number;
  translatedCount: number;
  percentage: number;
  groups: Record<string, UntranslatedEntry[]>;
  modStats: Record<string, ModStats>;
  header: string; // PO file header
  pluralCount: number; // Number of plural forms from header
}

interface UntranslatedEntry {
  entry: PoEntry; // Store full entry for complete context
}

/**
 * Generate untranslated strings report
 */
export async function reportUntranslated(options: ReportOptions): Promise<UntranslatedReport> {
  const {
    input,
    output = './reports',
    format = 'console',
    verbose = false,
    groupBy = 'source'
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

  log(`📂 Found ${files.length} file(s)`);

  const groups: Record<string, UntranslatedEntry[]> = {};
  const modTotals: Record<string, number> = {};
  const modSourceGroups: Record<string, Record<string, UntranslatedEntry[]>> = {};
  let totalEntries = 0;
  let untranslatedCount = 0;
  let fuzzyCount = 0;
  let poHeader = '';
  let pluralCount = 2;

  for (const file of files) {
    log(`  📖 Scanning ${file}...`);

    const content = await Bun.file(file).text();
    const poFile = parsePo(content, file);

    // Capture header from first file
    if (!poHeader && poFile.header.raw) {
      poHeader = poFile.header.raw;
      pluralCount = inferPluralCount(poFile.header.pluralForms);
    }

    for (const entry of poFile.entries) {
      totalEntries++;

      // Track total per mod for ALL entries (needed to compute per-mod progress %)
      const entrySource = entry.references.length > 0
        ? extractSourcePath(entry.references[0]!)
        : 'unknown';
      const entryMod = extractModName(entrySource);
      modTotals[entryMod] = (modTotals[entryMod] ?? 0) + 1;

      if (entry.isUntranslated || entry.isFuzzy) {
        if (entry.isUntranslated) untranslatedCount++;
        if (entry.isFuzzy) fuzzyCount++;

        // Determine group key for the main report
        let groupKey: string;
        if (groupBy === 'file') {
          groupKey = file;
        } else if (groupBy === 'source') {
          groupKey = entrySource;
        } else {
          groupKey = 'all';
        }

        if (!groups[groupKey]) {
          groups[groupKey] = [] as typeof groups[string];
        }
        groups[groupKey]!.push({ entry });

        // Always index by source path for per-mod reports
        if (!modSourceGroups[entryMod]) modSourceGroups[entryMod] = {};
        if (!modSourceGroups[entryMod]![entrySource]) modSourceGroups[entryMod]![entrySource] = [];
        modSourceGroups[entryMod]![entrySource]!.push({ entry });
      }
    }
  }

  const translatedCount = totalEntries - untranslatedCount;
  const percentage = totalEntries > 0 ? Math.round((translatedCount / totalEntries) * 100) : 100;

  // Build per-mod statistics
  const modStats: Record<string, ModStats> = {};
  for (const [modName, total] of Object.entries(modTotals).sort((a, b) => a[0].localeCompare(b[0]))) {
    const modGroups = modSourceGroups[modName] ?? {};
    const pendingCount = Object.values(modGroups).reduce((s, arr) => s + arr.length, 0);
    const modPct = total > 0 ? Math.round(((total - pendingCount) / total) * 100) : 100;
    modStats[modName] = {
      modName,
      displayName: modDisplayName(modName),
      totalEntries: total,
      pendingCount,
      percentage: modPct,
      groups: modGroups,
    };
  }

  const report: UntranslatedReport = {
    timestamp: new Date().toISOString(),
    files,
    totalEntries,
    untranslatedCount,
    fuzzyCount,
    translatedCount,
    percentage,
    groups,
    modStats,
    header: poHeader,
    pluralCount
  };

  // Output
  if (format === 'console') {
    printConsoleReport(report);
  } else if (format === 'markdown') {
    const md = generateMarkdown(report);
    const path = `${output}/untranslated-report.md`;
    await Bun.write(path, md);
    console.log(`📝 Report saved to: ${path}`);

    // Generate per-mod markdown reports
    await generateModReports(report, output, verbose);

    // Generate individual .po files by source file
    if (groupBy === 'source') {
      await generateIndividualReports(report, output, verbose);
    }
  } else if (format === 'json') {
    const path = `${output}/untranslated-report.json`;
    await Bun.write(path, JSON.stringify(report, null, 2));
    console.log(`📄 Report saved to: ${path}`);
  }

  return report;
}

function printConsoleReport(report: UntranslatedReport): void {
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  CDDA Translation Progress Report');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');

  // Progress bar
  const barWidth = 40;
  const filled = Math.round((report.percentage / 100) * barWidth);
  const empty = barWidth - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);

  console.log(`  Progress: [${bar}] ${report.percentage}%`);
  console.log('');
  console.log(`  Total strings:      ${report.totalEntries}`);
  console.log(`  Translated:         ${report.translatedCount}`);
  console.log(`  Untranslated:       ${report.untranslatedCount}`);
  console.log(`  Fuzzy (needs work): ${report.fuzzyCount}`);
  console.log('');

  // Show groups summary
  const sortedGroups = Object.entries(report.groups)
    .sort((a, b) => b[1].length - a[1].length);

  console.log('───────────────────────────────────────────────────────');
  console.log('  Untranslated by Source');
  console.log('───────────────────────────────────────────────────────');
  console.log('');

  for (const [group, entries] of sortedGroups.slice(0, 20)) {
    const fuzzy = entries.filter(e => e.entry.isFuzzy).length;
    const untrans = entries.length - fuzzy;
    console.log(`  ${group}`);
    console.log(`    📝 ${untrans} untranslated, 🔄 ${fuzzy} fuzzy`);
  }

  if (sortedGroups.length > 20) {
    console.log(`  ... and ${sortedGroups.length - 20} more groups`);
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
}

/**
 * Generate the overview/index markdown report.
 * Shows global progress and a per-mod summary table with mini progress bars.
 */
function generateMarkdown(report: UntranslatedReport): string {
  const lines: string[] = [];

  lines.push('# CDDA Translation Progress Report');
  lines.push('');
  lines.push(`**Generated:** ${report.timestamp}`);
  lines.push('');
  lines.push(`\`${progressBar(report.percentage)}\` **${report.percentage}%**`);
  lines.push('');

  lines.push('## Progress');
  lines.push('');
  lines.push('| Metric | Count |');
  lines.push('|--------|------:|');
  lines.push(`| Total strings | ${report.totalEntries} |`);
  lines.push(`| ✅ Translated | ${report.translatedCount} |`);
  lines.push(`| 📝 Untranslated | ${report.untranslatedCount} |`);
  lines.push(`| 🔄 Fuzzy (needs review) | ${report.fuzzyCount} |`);
  lines.push(`| ⏳ Total pending | ${report.untranslatedCount + report.fuzzyCount} |`);
  lines.push('');

  const modsWithWork = Object.values(report.modStats)
    .filter(m => m.pendingCount > 0)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  if (modsWithWork.length === 0) {
    lines.push('✅ **All strings are translated!**');
    return lines.join('\n');
  }

  lines.push('## Mods Overview');
  lines.push('');
  lines.push('| Mod | Progress | Pending | Details |');
  lines.push('|-----|:---------|--------:|:--------|');
  for (const mod of modsWithWork) {
    const bar = `\`${progressBar(mod.percentage, 16)}\` ${mod.percentage}%`;
    const link = `[View →](mods/${modFileName(mod.modName)})`;
    lines.push(`| ${escapeMdCell(mod.displayName)} | ${bar} | **${mod.pendingCount}** | ${link} |`);
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate a full markdown report for a single mod.
 */
function generateModMarkdown(mod: ModStats, timestamp: string): string {
  const lines: string[] = [];

  lines.push(`# ${mod.displayName} — Translation Progress`);
  lines.push('');
  lines.push(`**Generated:** ${timestamp}`);
  lines.push('');
  lines.push(`\`${progressBar(mod.percentage)}\` **${mod.percentage}%**`);
  lines.push('');

  const translated = mod.totalEntries - mod.pendingCount;
  const allEntries = Object.values(mod.groups).flat();
  const untransCount = allEntries.filter(e => !e.entry.isFuzzy).length;
  const fuzzyCount = allEntries.filter(e => e.entry.isFuzzy).length;

  lines.push('## Progress');
  lines.push('');
  lines.push('| Metric | Count |');
  lines.push('|--------|------:|');
  lines.push(`| Total strings | ${mod.totalEntries} |`);
  lines.push(`| ✅ Translated | ${translated} |`);
  lines.push(`| 📝 Untranslated | ${untransCount} |`);
  lines.push(`| 🔄 Fuzzy (needs review) | ${fuzzyCount} |`);
  lines.push(`| ⏳ Total pending | ${mod.pendingCount} |`);
  lines.push('');

  if (mod.pendingCount === 0) {
    lines.push('✅ **All strings are translated!**');
    return lines.join('\n');
  }

  const sortedGroups = Object.entries(mod.groups)
    .sort((a, b) => a[0].localeCompare(b[0]));

  // Source files navigation table
  lines.push('## Source Files');
  lines.push('');
  lines.push('| Source | Untranslated | Fuzzy | Pending |');
  lines.push('|--------|------------:|------:|--------:|');
  for (const [sourcePath, entries] of sortedGroups) {
    const fuzz = entries.filter(e => e.entry.isFuzzy).length;
    const unt = entries.filter(e => !e.entry.isFuzzy).length;
    const short = trimSourcePath(sourcePath, mod.modName);
    lines.push(`| [${escapeMdCell(short)}](#${groupAnchor(short)}) | ${unt} | ${fuzz} | **${entries.length}** |`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Per-source string tables
  for (const [sourcePath, entries] of sortedGroups) {
    const short = trimSourcePath(sourcePath, mod.modName);
    const fuzzyEntries = entries.filter(e => e.entry.isFuzzy);
    const untransEntries = entries.filter(e => !e.entry.isFuzzy);

    lines.push(`## ${short}`);
    lines.push('');

    const parts: string[] = [];
    if (untransEntries.length > 0) parts.push(`📝 ${untransEntries.length} untranslated`);
    if (fuzzyEntries.length > 0) parts.push(`🔄 ${fuzzyEntries.length} fuzzy`);
    lines.push(`_${parts.join(' · ')}_`);
    lines.push('');

    if (untransEntries.length > 0) {
      lines.push('**Untranslated**');
      lines.push('');
      lines.push('| Source string | Context | Reference |');
      lines.push('|:--------------|:--------|:----------|');
      for (const { entry: e } of untransEntries.slice(0, MD_ENTRIES_PER_GROUP)) {
        const src = e.msgid_plural
          ? `${mdCode(e.msgid)} / ${mdCode(e.msgid_plural)}`
          : mdCode(e.msgid);
        const ctx = e.msgctxt ? mdCode(e.msgctxt) : '';
        lines.push(`| ${src} | ${ctx} | ${e.references[0] ?? ''} |`);
      }
      if (untransEntries.length > MD_ENTRIES_PER_GROUP) {
        lines.push(`| _…and ${untransEntries.length - MD_ENTRIES_PER_GROUP} more_ | | |`);
      }
      lines.push('');
    }

    if (fuzzyEntries.length > 0) {
      lines.push('**Fuzzy — needs review**');
      lines.push('');
      lines.push('| Source string | Current translation | Context | Reference |');
      lines.push('|:--------------|:--------------------|:--------|:----------|');
      for (const { entry: e } of fuzzyEntries.slice(0, MD_ENTRIES_PER_GROUP)) {
        const src = mdCode(e.msgid);
        const cur = e.msgstr ? mdCode(e.msgstr) : '_empty_';
        const ctx = e.msgctxt ? mdCode(e.msgctxt) : '';
        lines.push(`| ${src} | ${cur} | ${ctx} | ${e.references[0] ?? ''} |`);
      }
      if (fuzzyEntries.length > MD_ENTRIES_PER_GROUP) {
        lines.push(`| _…and ${fuzzyEntries.length - MD_ENTRIES_PER_GROUP} more_ | | | |`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Write one markdown file per mod under outputDir/mods/.
 */
async function generateModReports(
  report: UntranslatedReport,
  outputDir: string,
  verbose: boolean
): Promise<void> {
  const log = verbose ? console.log : () => {};
  const modsDir = `${outputDir}/mods`;
  let count = 0;

  for (const mod of Object.values(report.modStats)) {
    if (mod.pendingCount === 0) continue;
    const md = generateModMarkdown(mod, report.timestamp);
    const filePath = `${modsDir}/${modFileName(mod.modName)}`;
    await Bun.write(filePath, md);
    log(`  📄 ${filePath}`);
    count++;
  }

  if (count > 0) {
    console.log(`📂 Per-mod reports (${count}) saved to: ${modsDir}/`);
  }
}

/** Max entries shown per source section before truncating */
const MD_ENTRIES_PER_GROUP = 20;

/**
 * Render a block progress bar of the given width.
 */
function progressBar(percentage: number, width = 32): string {
  const filled = Math.round((percentage / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/**
 * Extract the mod name from a source-file path.
 *   data/mods/<Name>/...  →  '<Name>'
 *   anything else         →  'base-game'
 */
function extractModName(sourcePath: string): string {
  const m = sourcePath.match(/^data\/mods\/([^/]+)\//);
  if (m) return m[1]!;
  return 'base-game';
}

function modDisplayName(modName: string): string {
  if (modName === 'base-game') return 'Base Game';
  return modName.replace(/_/g, ' ');
}

/** Safe lowercase filename for a mod report (e.g. 'Xedra_Evolved' → 'xedra_evolved.md'). */
function modFileName(modName: string): string {
  return `${modName.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}.md`;
}

/**
 * Strip the mod/base-game path prefix so headings are short.
 *   data/mods/Xedra_Evolved/effects/effects.json  →  effects/effects.json
 *   data/json/professions.json                    →  professions.json
 */
function trimSourcePath(sourcePath: string, modName: string): string {
  if (modName === 'base-game') {
    return sourcePath.replace(/^data\/json\//, '');
  }
  return sourcePath.replace(new RegExp(`^data/mods/${modName}/`), '');
}

/**
 * Convert a heading text to a GFM anchor id.
 * Matches GitHub/VS Code: lowercase, keep [a-z0-9_-], remove everything else, spaces→hyphens.
 */
function groupAnchor(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9_\s-]/g, '').replace(/\s+/g, '-');
}

/**
 * Format a string as a markdown inline code span safe inside a table cell.
 */
function mdCode(str: string, maxLen = 70): string {
  if (!str) return '';
  const safe = str.replace(/\n/g, '↵').replace(/\|/g, '\\|').replace(/`/g, "'");
  const display = safe.length > maxLen ? safe.slice(0, maxLen - 1) + '…' : safe;
  return `\`${display}\``;
}

/**
 * Escape pipe characters in a plain markdown table cell string.
 */
function escapeMdCell(str: string): string {
  return str.replace(/\|/g, '\\|');
}

/**
 * Escape string for .po file format
 */
function escapePoString(str: string): string {
  if (!str || typeof str !== 'string') {
    return '';
  }
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
}

/**
 * Generate individual report files for each source file
 */
async function generateIndividualReports(
  report: UntranslatedReport,
  outputDir: string,
  verbose: boolean
): Promise<void> {
  const log = verbose ? console.log : () => {};
  const baseDir = outputDir;

  log(`\n📁 Generating individual reports in ${baseDir}...`);

  let fileCount = 0;

  for (const [sourcePath, entries] of Object.entries(report.groups)) {
    if (sourcePath === 'unknown' || sourcePath === 'all') continue;

    // Create the directory structure - use .po extension
    // Prevent path traversal from PO reference comments
    const safePath = sourcePath.replace(/\.\.[\/\\]/g, '');
    const fullPath = `${baseDir}/${safePath}.po`;
    const dirPath = fullPath.substring(0, fullPath.lastIndexOf('/'));

    // Generate the .po file content
    const lines: string[] = [];

    // Add PO file header
    lines.push('msgid ""');
    lines.push('msgstr ""');

    // Split header into lines and format properly
    if (report.header) {
      const headerLines = report.header.split('\\n').filter(l => l.trim());
      for (const hl of headerLines) {
        lines.push(`"${hl}\\n"`);
      }
    } else {
      // Minimal fallback header with no language assumption
      lines.push('"Content-Type: text/plain; charset=UTF-8\\n"');
    }
    lines.push('');

    // Sort entries by fuzzy status (untranslated first, then fuzzy)
    const sortedEntries = [...entries].sort((a, b) => {
      if (a.entry.isFuzzy === b.entry.isFuzzy) return 0;
      return a.entry.isFuzzy ? 1 : -1;
    });

    // Generate .po entries with full context
    for (const item of sortedEntries) {
      const entry = item.entry;

      // Extracted comments (translator notes like "~ Monster name")
      for (const comment of entry.extractedComments) {
        lines.push(`#. ${comment}`);
      }

      // Reference comments
      for (const ref of entry.references) {
        lines.push(`#: ${ref}`);
      }

      // Flags (like fuzzy)
      if (entry.flags.length > 0) {
        lines.push(`#, ${entry.flags.join(', ')}`);
      }

      // Context if present
      if (entry.msgctxt) {
        lines.push(`msgctxt "${escapePoString(entry.msgctxt)}"`);
      }

      // Message ID
      lines.push(`msgid "${escapePoString(entry.msgid)}"`);

      // Plural form if present
      if (entry.msgid_plural) {
        lines.push(`msgid_plural "${escapePoString(entry.msgid_plural)}"`);

        // Empty plural translations — use actual indices from entry if available,
        // otherwise use the plural count inferred from the PO header
        if (entry.msgstr_plural) {
          const indices = Object.keys(entry.msgstr_plural).map(Number).sort((a, b) => a - b);
          for (const idx of indices) {
            lines.push(`msgstr[${idx}] ""`);
          }
        } else {
          for (let i = 0; i < report.pluralCount; i++) {
            lines.push(`msgstr[${i}] ""`);
          }
        }
      } else {
        // Empty translation
        lines.push('msgstr ""');
      }

      lines.push('');
    }

    const content = lines.join('\n');
    await Bun.write(fullPath, content);
    fileCount++;
    log(`  ✓ ${fullPath}`);
  }

  console.log(`\n✅ Generated ${fileCount} individual report files in ${baseDir}/`);
}

// CLI handler
export async function runReportUntranslated(args: string[]): Promise<void> {
  const options: ReportOptions = {
    input: [],
    output: './reports',
    format: 'console',
    verbose: false,
    groupBy: 'source'
  };

  const inputs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--input' || arg === '-i') {
      inputs.push(args[++i] ?? '');
    } else if (arg === '--output' || arg === '-o') {
      options.output = args[++i] ?? './reports';
    } else if (arg === '--format' || arg === '-f') {
      options.format = (args[++i] ?? 'console') as ReportOptions['format'];
    } else if (arg === '--group-by' || arg === '-g') {
      options.groupBy = (args[++i] ?? 'source') as ReportOptions['groupBy'];
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (!arg.startsWith('-')) {
      inputs.push(arg);
    }
  }

  if (inputs.length === 0) {
    console.error('❌ Error: No input file(s) specified');
    console.log('\nUsage: bun report:untranslated [options] <files...>');
    console.log('\nOptions:');
    console.log('  -i, --input <file>     Input .po file or glob pattern');
    console.log('  -o, --output <dir>     Output directory (default: ./reports)');
    console.log('  -f, --format <fmt>     Output format: console, markdown, json');
    console.log('  -g, --group-by <mode>  Group by: file, source, none');
    console.log('  -v, --verbose          Verbose output');
    process.exit(1);
  }

  options.input = inputs;

  console.log('📊 CDDA Translation Progress Report\n');

  await reportUntranslated(options);
}
