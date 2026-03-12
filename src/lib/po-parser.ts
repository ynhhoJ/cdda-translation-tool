/**
 * PO File Parser for CDDA Translation Tool
 *
 * Parses GNU gettext .po files into structured data
 */

import type { PoEntry, PoFile, PoHeader } from '../types';

/**
 * Parse a .po file content into structured data
 */
export function parsePo(content: string, filePath: string = ''): PoFile {
  const lines = content.split('\n');
  const entries: PoEntry[] = [];
  let header: PoHeader = { raw: '' };

  let currentEntry: Partial<PoEntry> = createEmptyEntry();
  let currentField: 'msgctxt' | 'msgid' | 'msgid_plural' | 'msgstr' | null = null;
  let currentPluralIndex: number | null = null;
  let lineNumber = 0;
  let entryStartLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    lineNumber = i + 1;

    // Skip empty lines (they mark entry boundaries)
    if (line.trim() === '') {
      if (currentEntry.msgid !== undefined && currentEntry.msgid !== '') {
        finalizeEntry(currentEntry as PoEntry, entries, entryStartLine);
      } else if (currentEntry.msgid === '' && currentEntry.msgstr) {
        // This is the header
        header = parseHeader(currentEntry.msgstr);
      }
      currentEntry = createEmptyEntry();
      currentField = null;
      currentPluralIndex = null;
      entryStartLine = lineNumber + 1;
      continue;
    }

    // Reference comments (#:)
    if (line.startsWith('#:')) {
      const refs = line.slice(2).trim().split(/\s+/);
      currentEntry.references = [...(currentEntry.references || []), ...refs];
      continue;
    }

    // Translator comments (#)
    if (line.startsWith('# ') || line === '#') {
      currentEntry.translatorComments = [
        ...(currentEntry.translatorComments || []),
        line.slice(1).trim()
      ];
      continue;
    }

    // Extracted comments (#.)
    if (line.startsWith('#.')) {
      currentEntry.extractedComments = [
        ...(currentEntry.extractedComments || []),
        line.slice(2).trim()
      ];
      continue;
    }

    // Flags (#,)
    if (line.startsWith('#,')) {
      const flags = line.slice(2).trim().split(',').map(f => f.trim());
      currentEntry.flags = [...(currentEntry.flags || []), ...flags];
      if (flags.includes('fuzzy')) {
        currentEntry.isFuzzy = true;
      }
      continue;
    }

    // Previous msgid (#|)
    if (line.startsWith('#|')) {
      continue; // Skip previous msgid markers for now
    }

    // msgctxt
    if (line.startsWith('msgctxt ')) {
      currentEntry.msgctxt = extractString(line.slice(8));
      currentField = 'msgctxt';
      continue;
    }

    // msgid
    if (line.startsWith('msgid ')) {
      currentEntry.msgid = extractString(line.slice(6));
      currentField = 'msgid';
      continue;
    }

    // msgid_plural
    if (line.startsWith('msgid_plural ')) {
      currentEntry.msgid_plural = extractString(line.slice(13));
      currentField = 'msgid_plural';
      continue;
    }

    // msgstr[n] (plural forms)
    const pluralMatch = line.match(/^msgstr\[(\d+)\]\s+/);
    if (pluralMatch) {
      const index = parseInt(pluralMatch[1]!, 10);
      const value = extractString(line.slice(pluralMatch[0].length));
      if (!currentEntry.msgstr_plural) {
        currentEntry.msgstr_plural = {};
      }
      currentEntry.msgstr_plural[index] = value;
      currentField = 'msgstr';
      currentPluralIndex = index;
      continue;
    }

    // msgstr
    if (line.startsWith('msgstr ')) {
      currentEntry.msgstr = extractString(line.slice(7));
      currentField = 'msgstr';
      currentPluralIndex = null;
      continue;
    }

    // Continuation line (starts with ")
    if (line.startsWith('"')) {
      const value = extractString(line);
      if (currentField === 'msgctxt') {
        currentEntry.msgctxt = (currentEntry.msgctxt || '') + value;
      } else if (currentField === 'msgid') {
        currentEntry.msgid = (currentEntry.msgid || '') + value;
      } else if (currentField === 'msgid_plural') {
        currentEntry.msgid_plural = (currentEntry.msgid_plural || '') + value;
      } else if (currentField === 'msgstr') {
        if (currentPluralIndex !== null && currentEntry.msgstr_plural) {
          currentEntry.msgstr_plural[currentPluralIndex] =
            (currentEntry.msgstr_plural[currentPluralIndex] || '') + value;
        } else {
          currentEntry.msgstr = (currentEntry.msgstr || '') + value;
        }
      }
      continue;
    }
  }

  // Don't forget the last entry
  if (currentEntry.msgid !== undefined && currentEntry.msgid !== '') {
    finalizeEntry(currentEntry as PoEntry, entries, entryStartLine);
  }

  return {
    header,
    entries,
    filePath
  };
}

/**
 * Serialize a PoFile back to .po format string
 */
export function serializePo(poFile: PoFile): string {
  const lines: string[] = [];

  // Write header
  if (poFile.header.raw) {
    lines.push('msgid ""');
    lines.push('msgstr ""');
    const headerLines = poFile.header.raw.split('\\n').filter(l => l);
    for (const hl of headerLines) {
      lines.push(`"${hl}\\n"`);
    }
    lines.push('');
  }

  // Write entries
  for (const entry of poFile.entries) {
    // Translator comments
    for (const comment of entry.translatorComments) {
      lines.push(`# ${comment}`);
    }

    // Extracted comments
    for (const comment of entry.extractedComments) {
      lines.push(`#. ${comment}`);
    }

    // References
    if (entry.references.length > 0) {
      // Group references, max ~80 chars per line
      let refLine = '#:';
      for (const ref of entry.references) {
        if (refLine.length + ref.length + 1 > 80 && refLine !== '#:') {
          lines.push(refLine);
          refLine = '#:';
        }
        refLine += ' ' + ref;
      }
      if (refLine !== '#:') {
        lines.push(refLine);
      }
    }

    // Flags
    if (entry.flags.length > 0) {
      lines.push(`#, ${entry.flags.join(', ')}`);
    }

    // msgctxt
    if (entry.msgctxt) {
      lines.push(`msgctxt ${encodeString(entry.msgctxt)}`);
    }

    // msgid
    lines.push(`msgid ${encodeString(entry.msgid)}`);

    // msgid_plural
    if (entry.msgid_plural) {
      lines.push(`msgid_plural ${encodeString(entry.msgid_plural)}`);
    }

    // msgstr / msgstr[n]
    if (entry.msgstr_plural) {
      const indices = Object.keys(entry.msgstr_plural).map(Number).sort((a, b) => a - b);
      for (const idx of indices) {
        lines.push(`msgstr[${idx}] ${encodeString(entry.msgstr_plural[idx] ?? '')}`);
      }
    } else {
      lines.push(`msgstr ${encodeString(entry.msgstr)}`);
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Extract source file path from reference comment
 * e.g., "data/json/furniture.json:123" -> "data/json/furniture.json"
 */
export function extractSourcePath(reference: string): string {
  const colonIdx = reference.lastIndexOf(':');
  if (colonIdx > 0) {
    return reference.slice(0, colonIdx);
  }
  return reference;
}

/**
 * Group entries by their source file path
 */
export function groupEntriesBySource(entries: PoEntry[]): Map<string, PoEntry[]> {
  const groups = new Map<string, PoEntry[]>();

  for (const entry of entries) {
    // Use first reference path, or 'unknown' if none
    const sourcePath = entry.references.length > 0
      ? extractSourcePath(entry.references[0]!)
      : 'unknown';

    if (!groups.has(sourcePath)) {
      groups.set(sourcePath, []);
    }
    groups.get(sourcePath)!.push(entry);
  }

  return groups;
}

// --- Helper functions ---

function createEmptyEntry(): Partial<PoEntry> {
  return {
    references: [],
    translatorComments: [],
    extractedComments: [],
    flags: [],
    isFuzzy: false,
    isUntranslated: false
  };
}

function finalizeEntry(entry: PoEntry, entries: PoEntry[], lineNumber: number): void {
  entry.lineNumber = lineNumber;

  // Check if untranslated
  if (entry.msgstr_plural) {
    entry.isUntranslated = Object.values(entry.msgstr_plural).every(s => s === '');
  } else {
    entry.isUntranslated = entry.msgstr === '';
  }

  entries.push(entry);
}

function extractString(str: string): string {
  // Remove surrounding quotes and unescape
  const trimmed = str.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return unescapeString(trimmed.slice(1, -1));
  }
  return trimmed;
}

function unescapeString(str: string): string {
  return str.replace(/\\([ntr"\\])/g, (_, ch) => {
    switch (ch) {
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': return '\r';
      case '"': return '"';
      case '\\': return '\\';
      default: return ch;
    }
  });
}

function encodeString(str: string): string {
  const escaped = str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\t/g, '\\t')
    .replace(/\r/g, '\\r');

  // Handle multiline strings
  if (escaped.includes('\n')) {
    const lines = escaped.split('\n');
    if (lines.length === 1) {
      return `"${escaped}"`;
    }
    // Multi-line: empty first line, then each line
    const result = ['""'];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isLast = i === lines.length - 1;
      if (isLast && line === '') continue; // Skip trailing empty
      result.push(`"${line}${isLast ? '' : '\\n'}"`);
    }
    return result.join('\n');
  }

  return `"${escaped}"`;
}

function parseHeader(raw: string): PoHeader {
  const regex = /POT(?:-Creation)?-Date:[^\r\n]*\r?\n?/g;
  const regex1 = /PO(?:-Revision)?-Date:[^\r\n]*\r?\n?/g;
  const regex2 = /Last-Translator:[^\r\n]*\r?\n?/g;
  const cleanedText = raw.replace(regex, "").replace(regex1, "").replace(regex2, "");
  const header: PoHeader = { raw: cleanedText.replace(/\n/g, '\\n') };
  const lines = cleanedText.split('\n');

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();

    switch (key) {
      case 'Project-Id-Version':
        header.projectIdVersion = value;
        break;
      case 'Report-Msgid-Bugs-To':
        header.reportMsgidBugsTo = value;
        break;
      case 'POT-Creation-Date':
        header.potCreationDate = value;
        break;
      case 'PO-Revision-Date':
        header.poRevisionDate = value;
        break;
      case 'Last-Translator':
        header.lastTranslator = value;
        break;
      case 'Language-Team':
        header.languageTeam = value;
        break;
      case 'Language':
        header.language = value;
        break;
      case 'MIME-Version':
        header.mimeVersion = value;
        break;
      case 'Content-Type':
        header.contentType = value;
        break;
      case 'Content-Transfer-Encoding':
        header.contentTransferEncoding = value;
        break;
      case 'Plural-Forms':
        header.pluralForms = value;
        break;
    }
  }

  return header;
}
