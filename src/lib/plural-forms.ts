/**
 * CLDR Plural Form Mapper
 *
 * Maps language codes to their ordered CLDR plural form names as used by Transifex.
 * Reference: https://cldr.unicode.org/index/cldr-spec/plural-rules
 */

/**
 * Returns the ordered CLDR plural form names for a given language code.
 *
 * These names correspond to the msgstr[n] indices in PO files:
 *   index 0 → forms[0], index 1 → forms[1], etc.
 */
export function getPluralForms(lang: string): string[] {
  const code = lang.toLowerCase().split(/[-_]/)[0] ?? '';

  switch (code) {
    // 1 form: [other]
    case 'ja': // Japanese
    case 'ko': // Korean
    case 'zh': // Chinese
    case 'vi': // Vietnamese
    case 'th': // Thai
    case 'id': // Indonesian
    case 'ms': // Malay
    case 'tr': // Turkish
    case 'az': // Azerbaijani
    case 'ka': // Georgian
    case 'km': // Khmer
    case 'lo': // Lao
    case 'my': // Burmese
    case 'si': // Sinhala (simplified)
      return ['other'];

    // 2 forms: [one, other] — most Western European languages
    case 'en':
    case 'de':
    case 'nl':
    case 'sv':
    case 'da':
    case 'no':
    case 'nb':
    case 'nn':
    case 'fi': // Finnish has 2 forms in PO practice
    case 'et':
    case 'hu':
    case 'el':
    case 'it':
    case 'pt':
    case 'es':
    case 'ca':
    case 'af':
    case 'sq':
    case 'hy':
    case 'eu':
    case 'gl':
    case 'eo':
    case 'is':
    case 'mk': // Macedonian (simplified)
    case 'mn':
    case 'ne':
    case 'ur':
      return ['one', 'other'];

    // French: [one, other] — singular for 0 and 1
    case 'fr':
      return ['one', 'other'];

    // 3 forms
    case 'lv': // Latvian: [zero, one, other]
      return ['zero', 'one', 'other'];

    case 'lt': // Lithuanian: [one, few, other]
      return ['one', 'few', 'other'];

    case 'ro': // Romanian: [one, few, other]
      return ['one', 'few', 'other'];

    case 'be': // Belarusian: [one, few, many] — same CLDR structure as Russian but 3 forms
    // Actually Belarusian has the same 4 CLDR forms as Russian — fall through

    // 4 forms: [one, few, many, other]
    case 'ru': // Russian
    case 'uk': // Ukrainian
    case 'sr': // Serbian
    case 'bs': // Bosnian
    case 'hr': // Croatian
    case 'pl': // Polish
    case 'cs': // Czech
    case 'sk': // Slovak
    case 'bg': // Bulgarian (simplified)
      return ['one', 'few', 'many', 'other'];

    // Slovenian: [one, two, few, other]
    case 'sl':
      return ['one', 'two', 'few', 'other'];

    // Hebrew: [one, two, many, other]
    case 'he':
    case 'iw': // legacy code for Hebrew
      return ['one', 'two', 'many', 'other'];

    // Arabic: 6 forms
    case 'ar':
      return ['zero', 'one', 'two', 'few', 'many', 'other'];

    // Irish/Breton: 5 forms
    case 'ga': // Irish
    case 'br': // Breton
      return ['one', 'two', 'few', 'many', 'other'];

    // Maltese: 4 forms [one, few, many, other]
    case 'mt':
      return ['one', 'few', 'many', 'other'];

    // Default: 2 forms for any unrecognized language
    default:
      return ['one', 'other'];
  }
}

/**
 * Parse the nplurals count from a PO file Plural-Forms header value.
 *
 * Example: "nplurals=4; plural=(n%10==1 && n%100!=11 ? 0 : ...)" → 4
 * Returns 2 as a safe default if parsing fails.
 */
export function inferPluralCount(pluralFormsHeader: string | undefined): number {
  if (!pluralFormsHeader) return 2;
  const match = pluralFormsHeader.match(/nplurals\s*=\s*(\d+)/);
  if (match && match[1]) {
    const n = parseInt(match[1], 10);
    if (n >= 1 && n <= 6) return n;
  }
  return 2;
}
