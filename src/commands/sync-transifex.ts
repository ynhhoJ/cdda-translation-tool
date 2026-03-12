/**
 * Sync Translation Changes to Transifex
 *
 * Uses git to detect changed translations and pushes them to Transifex API
 */

import { parsePo } from '../lib/po-parser';
import { getPluralForms } from '../lib/plural-forms';
import type { PoEntry } from '../types';
import { execSync, spawnSync } from 'child_process';
import * as crypto from 'crypto';
import * as path from 'path';
import * as readline from 'readline';

// Safety thresholds
/** Number of regressions (translations cleared) that trigger a hard block requiring --force */
const REGRESSION_BLOCK_THRESHOLD = 5;
/** Number of changed strings that trigger a "large update" warning in the confirmation prompt */
const LARGE_CHANGE_WARNING_THRESHOLD = 100;

interface TransifexConfig {
  apiToken: string;
  organization: string;
  project: string;
  resource: string;
  language: string;
}

interface ChangedEntry {
  entry: PoEntry;
  filePath: string;
  stringHash: string;
}

/**
 * Ask the user a yes/no question on stdout/stdin.
 * Returns true if the user answers "y" or "yes" (case-insensitive).
 */
async function promptConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      const a = answer.trim().toLowerCase();
      resolve(a === 'y' || a === 'yes');
    });
  });
}

/**
 * Get Transifex configuration from environment variables
 */
function getTransifexConfig(): TransifexConfig {
  const apiToken = process.env.TRANSIFEX_API_TOKEN;
  const organization = process.env.TRANSIFEX_ORG || 'cataclysm-dda-translators';
  const project = process.env.TRANSIFEX_PROJECT || 'cataclysm-dda';
  const resource = process.env.TRANSIFEX_RESOURCE || 'master-cataclysm-dda';
  const language = process.env.TRANSIFEX_LANGUAGE || '';

  if (!apiToken) {
    throw new Error(
      'TRANSIFEX_API_TOKEN environment variable is required.\n' +
      'Copy .env.example to .env and fill in your Transifex API token.'
    );
  }

  if (!language) {
    throw new Error(
      'TRANSIFEX_LANGUAGE environment variable is required (e.g. ru, de, fr).\n' +
      'Set it in your .env file.'
    );
  }

  return { apiToken, organization, project, resource, language };
}

/**
 * Get git repository root
 */
function getGitRoot(): string {
  try {
    const root = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
    return root;
  } catch (error) {
    throw new Error('Not in a git repository');
  }
}

/**
 * Calculate MD5 hash for a source string (Transifex string hash)
 *
 * Transifex uses: md5(string_key + ':' + context)
 * - If no context, use empty string BUT still add colon separator
 * - Join key and context with colon separator
 * - NO additional escaping of colons in the formula
 * - BUT preserve \: sequences from PO files as-is
 *
 * Verified against real Transifex API responses:
 *
 * Example 1 (with context):
 *   Key: "My evac shelter got swarmed by some of those bees..."
 *   Context: "npc:f"
 *   Hash: md5("...:npc:f") = 8226960a8576a81beaeb90aa4267cf41 ✅
 *
 * Example 2 (empty context, with \: in key):
 *   Key: "...but like I said\: I think..." (contains \:)
 *   Context: "" (empty)
 *   Hash: md5("...said\: I...:")  = 7eb12bef0c43b901c7c3c4eb3eb106c5 ✅
 *
 * Example 3 (plural, empty context):
 *   Key: "busted grocery bot"
 *   Plural: "busted grocery bots"
 *   Context: "" (empty)
 *   Hash: md5("busted grocery bot:busted grocery bots:") = bbc7248282f447ff6c8c18ae44de98d5 ✅
 *
 * For plural strings, the key is: escapedMsgid + ':' + escapedMsgidPlural
 * then the usual ':' + context is appended.
 */
function calculateStringHash(msgid: string, msgctxt?: string, msgid_plural?: string): string {
  const escapedMsgid = msgid.replace(/:/g, '\\:');
  const key = msgid_plural
    ? `${escapedMsgid}:${msgid_plural.replace(/:/g, '\\:')}`
    : escapedMsgid;
  const context = msgctxt || '';
  const content = `${key}:${context}`;
  return crypto.createHash('md5').update(content, 'utf-8').digest('hex');
}

/**
 * Get changed translation files from git (.po and .cpp PO-format files)
 * Returns absolute paths
 */
/**
 * Validate a git ref to prevent command injection.
 * Only allows alphanumeric, hyphens, dots, underscores, slashes, tildes, and carets.
 */
function validateGitRef(ref: string): string {
  if (!/^[a-zA-Z0-9_.\-\/~^]+$/.test(ref)) {
    throw new Error(`Invalid git ref: ${ref}`);
  }

  return ref;
}

function getChangedPoFiles(since?: string): string[] {
  try {
    const ref = since ? `${validateGitRef(since)} HEAD` : 'HEAD';
    const gitRoot = getGitRoot();

    const results: string[] = [];

    for (const pattern of ['*.po', 'translation/**/*.cpp']) {
      try {
        const output = execSync(
          `git diff --name-only ${ref} -- "${pattern}"`,
          { encoding: 'utf-8', cwd: gitRoot }
        );
        output
          .split('\n')
          .filter(line => line.trim() !== '')
          .forEach(relativePath => results.push(path.join(gitRoot, relativePath)));
      } catch {
        // pattern produced no output or isn't supported — skip
      }
    }

    console.log(results);

    return results;
  } catch (error) {
    console.error('Error getting changed files from git:', error);
    return [];
  }
}

/**
 * Get changed translations from a .po file using git diff.
 * Also counts regressions: strings that had a translation before but are now empty.
 */
async function getChangedTranslations(
  filePath: string,
  since?: string
): Promise<{ changed: ChangedEntry[]; regressions: number }> {
  try {
    // Get the current version of the file
    const currentContent = await Bun.file(filePath).text();
    const currentPo = parsePo(currentContent, filePath);

    // Convert absolute path to relative path for git commands
    const gitRoot = getGitRoot();
    const relativePath = path.relative(gitRoot, filePath);

    // Get the previous version from git
    const gitCommand = since
      ? `git show ${validateGitRef(since)}:${relativePath}`
      : `git show HEAD:${relativePath}`;

    let previousContent: string;
    try {
      previousContent = execSync(gitCommand, { encoding: 'utf-8' });
    } catch (error) {
      // File might be new, treat all entries as changed
      console.log(`File ${filePath} appears to be new, including all translations`);
      return {
        changed: currentPo.entries
          .filter(entry => entry.msgstr_plural
            ? Object.values(entry.msgstr_plural).some(v => v.trim() !== '')
            : (entry.msgstr && entry.msgstr.trim() !== ''))
          .map(entry => ({
            entry,
            filePath,
            stringHash: calculateStringHash(entry.msgid, entry.msgctxt, entry.msgid_plural)
          })),
        regressions: 0
      };
    }

    const previousPo = parsePo(previousContent, filePath);

    // Build a map of previous translations — also track whether each entry had content
    const previousMap = new Map<string, { value: string; hadContent: boolean }>();
    for (const entry of previousPo.entries) {
      const key = `${entry.msgctxt || ''}|${entry.msgid}`;
      const translationValue = entry.msgstr_plural
        ? JSON.stringify(entry.msgstr_plural)
        : (entry.msgstr || '');
      const hadContent = entry.msgstr_plural
        ? Object.values(entry.msgstr_plural).some(v => v.trim() !== '')
        : (entry.msgstr || '').trim() !== '';
      previousMap.set(key, { value: translationValue, hadContent });
    }

    // Find changed entries and count regressions
    const changed: ChangedEntry[] = [];
    let regressions = 0;

    for (const entry of currentPo.entries) {
      const key = `${entry.msgctxt || ''}|${entry.msgid}`;
      const currentTranslation = entry.msgstr_plural
        ? JSON.stringify(entry.msgstr_plural)
        : (entry.msgstr || '');
      const prev = previousMap.get(key);
      const previousTranslation = prev?.value ?? '';
      const hadContent = prev?.hadContent ?? false;

      // Check if translation changed and is not empty
      const hasContent = entry.msgstr_plural
        ? Object.values(entry.msgstr_plural).some(v => v.trim() !== '')
        : (entry.msgstr || '').trim() !== '';

      if (currentTranslation !== previousTranslation) {
        if (hasContent) {
          changed.push({
            entry,
            filePath,
            stringHash: calculateStringHash(entry.msgid, entry.msgctxt, entry.msgid_plural)
          });
        } else if (hadContent) {
          // String previously had a translation but is now empty — a regression
          regressions++;
        }
      }
    }

    return { changed, regressions };
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
    return { changed: [], regressions: 0 };
  }
}

/**
 * Build Transifex resource translation ID
 */
function buildResourceTranslationId(
  config: TransifexConfig,
  stringHash: string
): string {
  return `o:${config.organization}:p:${config.project}:r:${config.resource}:s:${stringHash}:l:${config.language}`;
}

/**
 * Build translation strings object for Transifex API
 *
 * Maps msgstr_plural indices to CLDR plural form names for the given language.
 */
function buildStringsObject(entry: PoEntry, pluralForms: string[]): Record<string, string> {
  // For non-pluralized strings
  if (!entry.msgid_plural) {
    return { other: entry.msgstr || '' };
  }

  // For pluralized strings — map indices to CLDR form names
  const strings: Record<string, string> = {};

  if (entry.msgstr_plural) {
    Object.entries(entry.msgstr_plural).forEach(([index, value]) => {
      const idx = Number(index);
      if (idx < pluralForms.length && value) {
        const form = pluralForms[idx];
        if (form) {
          strings[form] = value;
        }
      }
    });
  }

  // Ensure 'other' is always present
  if (!strings.other) {
    strings.other = entry.msgstr || '';
  }

  return strings;
}

/**
 * Update a translation on Transifex
 */
async function updateTransifexTranslation(
  config: TransifexConfig,
  changedEntry: ChangedEntry
): Promise<boolean> {
  const resourceTranslationId = buildResourceTranslationId(config, changedEntry.stringHash);
  const url = `https://rest.api.transifex.com/resource_translations/${resourceTranslationId}`;

  const pluralForms = getPluralForms(config.language);

  const requestBody = {
    data: {
      type: 'resource_translations',
      id: resourceTranslationId,
      attributes: {
        strings: buildStringsObject(changedEntry.entry, pluralForms),
        reviewed: false
      }
    }
  };

  try {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${config.apiToken}`,
        'Content-Type': 'application/vnd.api+json',
        'Accept': 'application/vnd.api+json'
      },
      body: JSON.stringify(requestBody)
    });

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('Retry-After') || '5', 10);
      console.log(`⏳ Rate limited, waiting ${retryAfter}s...`);
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      // Retry once
      const retryResponse = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${config.apiToken}`,
          'Content-Type': 'application/vnd.api+json',
          'Accept': 'application/vnd.api+json'
        },
        body: JSON.stringify(requestBody)
      });
      if (!retryResponse.ok) {
        console.error(`Failed after rate-limit retry: ${retryResponse.status}`);
        return false;
      }
      console.log(`✓ Updated (after retry): ${changedEntry.entry.msgid}...`);
      return true;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Failed to update ${resourceTranslationId}:`,
        response.status,
        errorText,
        'Request body:',
        JSON.stringify(requestBody, null, 2)
      );
      return false;
    }

    console.log(`✓ Updated: ${changedEntry.entry.msgid}...`);
    return true;
  } catch (error) {
    console.error(`Error updating ${resourceTranslationId}:`, error);
    return false;
  }
}

/**
 * Format the current UTC time as "YYYY-MM-DD HH:MM:SS+0000" (same style as commit-po).
 */
function utcTimestamp(): string {
  return new Date().toISOString()
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/, '+0000');
}

/**
 * Stage the changed translation files and create a git commit that records
 * the sync event. If the files were already committed (e.g. after commit-po),
 * git add is a no-op and --allow-empty still produces an audit record.
 */
function commitSyncRecord(succeeded: number, changedFiles: string[], gitRoot: string): void {
  const message = `Synced ${succeeded} translation(s) to Transifex ${utcTimestamp()}`;

  // Stage the changed .po / .cpp files so the commit carries the actual diff
  // when sync-transifex is run before commit-po.
  for (const file of changedFiles) {
    const relPath = path.relative(gitRoot, file);
    spawnSync('git', ['add', relPath], { encoding: 'utf-8', cwd: gitRoot });
  }

  // Also stage the reports directory (mirrors what commit-po does).
  spawnSync('git', ['add', './reports/'], { encoding: 'utf-8', cwd: gitRoot });

  const result = spawnSync('git', ['commit', '--allow-empty', '-m', message], {
    encoding: 'utf-8',
    cwd: gitRoot,
  });
  if (result.status !== 0) {
    console.warn(`\n⚠️  Could not create git commit: ${result.stderr?.trim() || 'unknown error'}`);
    console.warn('   You can create it manually with:');
    console.warn(`   git commit --allow-empty -m "${message}"`);
  } else {
    console.log(`\n📌 Git commit created: "${message}"`);
    if (result.stdout?.trim()) {
      console.log(result.stdout.trim());
    }
  }
}

/**
 * Main sync function
 */
export async function syncToTransifex(
  options: { since?: string; dryRun?: boolean; yes?: boolean; force?: boolean; noCommit?: boolean } = {}
) {
  console.log('🔄 Starting Transifex sync...\n');

  const config = getTransifexConfig();
  console.log(`Config: ${config.organization}/${config.project}/${config.resource} [${config.language}]\n`);

  // Get changed .po files
  const changedFiles = getChangedPoFiles(options.since);

  if (changedFiles.length === 0) {
    console.log('No changed translation files found.');
    return;
  }

  console.log(`Found ${changedFiles.length} changed translation file(s):\n`);
  changedFiles.forEach(file => console.log(`  - ${file}`));
  console.log();

  // Collect all changed translations and count regressions
  const allChanges: ChangedEntry[] = [];
  let totalRegressions = 0;

  for (const file of changedFiles) {
    const { changed, regressions } = await getChangedTranslations(file, options.since);
    allChanges.push(...changed);
    totalRegressions += regressions;
  }

  if (allChanges.length === 0 && totalRegressions === 0) {
    console.log('No changed translations found.');
    return;
  }

  // ── Safety check 1: regression guard ─────────────────────────────────────
  // Regressions mean strings that had translations are now empty in the working
  // copy. This is a strong signal that something went wrong (accidental file
  // overwrite, partial revert, etc.).
  if (totalRegressions > 0) {
    const severity = totalRegressions >= REGRESSION_BLOCK_THRESHOLD ? '🚨' : '⚠️';
    console.warn(
      `\n${severity}  WARNING: ${totalRegressions} string(s) that previously had translations` +
      ' are now EMPTY in your working copy.'
    );
    console.warn('   This may indicate accidental data loss in the local .po file(s).\n');

    if (totalRegressions >= REGRESSION_BLOCK_THRESHOLD && !options.force) {
      console.error(
        `❌ Refusing to sync: ${totalRegressions} regressions exceed the safety` +
        ` threshold of ${REGRESSION_BLOCK_THRESHOLD}.\n` +
        '   Fix the regressions or re-run with --force to override this check.'
      );
      process.exit(1);
    }
  }

  console.log(`Found ${allChanges.length} changed translation(s)\n`);

  if (options.dryRun) {
    console.log('Dry run mode - would update:');
    allChanges.forEach(change => {
      console.log(`  - ${change.entry.msgid}...`);
      console.log(`    → ${change.entry.msgstr}`);
    });
    if (totalRegressions > 0) {
      console.log(`\n⚠️  ${totalRegressions} regression(s) would be skipped (not pushed).`);
    }
    return;
  }

  if (allChanges.length === 0) {
    console.log('No changed translations to push (only regressions detected).');
    return;
  }

  // ── Safety check 2: interactive confirmation ──────────────────────────────
  if (!options.yes && !options.force) {
    console.log('Summary of changes to be pushed to Transifex:');
    console.log(`  Organization : ${config.organization}`);
    console.log(`  Project      : ${config.project}`);
    console.log(`  Resource     : ${config.resource}`);
    console.log(`  Language     : ${config.language}`);
    console.log(`  Strings      : ${allChanges.length}`);

    if (allChanges.length >= LARGE_CHANGE_WARNING_THRESHOLD) {
      console.warn(
        `\n⚠️  LARGE UPDATE: you are about to push ${allChanges.length} strings.` +
        ' Please make sure this is intentional.'
      );
    }

    if (totalRegressions > 0) {
      console.warn(`\n⚠️  ${totalRegressions} regression(s) detected (will be skipped, not pushed).`);
    }

    const confirmed = await promptConfirmation('\nProceed? [y/N] ');
    if (!confirmed) {
      console.log('Aborted.');
      process.exit(0);
    }
    console.log();
  }

  // Update translations on Transifex
  console.log('Updating translations on Transifex...\n');

  let succeeded = 0;
  let failed = 0;

  for (const change of allChanges) {
    const success = await updateTransifexTranslation(config, change);
    if (success) {
      succeeded++;
    } else {
      failed++;
    }

    // Rate limiting: wait 120ms between requests (max 500 requests/min)
    await new Promise(resolve => setTimeout(resolve, 120));
  }

  console.log(`\n✨ Sync complete: ${succeeded} succeeded, ${failed} failed`);

  if (succeeded > 0 && !options.noCommit) {
    const gitRoot = getGitRoot();
    commitSyncRecord(succeeded, changedFiles, gitRoot);
  }
}

// CLI entry point
if (import.meta.main) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const yes = args.includes('--yes') || args.includes('-y');
  const force = args.includes('--force');
  const noCommit = args.includes('--no-commit');
  const sinceIndex = args.indexOf('--since');
  const since = sinceIndex >= 0 ? args[sinceIndex + 1] : undefined;

  syncToTransifex({ since, dryRun, yes, force, noCommit }).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
