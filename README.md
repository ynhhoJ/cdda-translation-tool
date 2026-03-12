# CDDA Translation Tool

Universal translation management and QA tool for **Cataclysm: Dark Days Ahead (CDDA)**.

Works with any CDDA-supported language. Integrates with Transifex (the official CDDA translation platform) and validates translation quality against language-agnostic rules.

---

## Quick Start (no Git experience needed)

> **What is Git?** Git is a version-control system that keeps a full history of every change made to files. This tool uses it behind the scenes to track which strings you translated and when. You don't need to know the details — the commands below handle everything for you. The only requirement is that Git is installed on your computer.

### 1. Install the prerequisites

| Tool | Why you need it | Where to get it |
|------|-----------------|-----------------|
| [Git](https://git-scm.com/downloads) | Tracks changes and powers the Transifex sync | git-scm.com |
| [Bun](https://bun.sh) | Runs this tool | bun.sh |

After installing both, open a terminal in the project folder and run:

```bash
bun install
```

### 2. Download your translation file

Download the `.po` file for your language from [Transifex](https://app.transifex.com/cataclysm-dda-translators/cataclysm-dda/translate/) and place it in the project folder.

The file is usually named something like:
`for_translation_cataclysm-dda_master-cataclysm-dda_ru.po`

### 3. Run Extract

```bash
bun run extract -i [path-to-your-file.po]
```

This single command does two things:
1. **Generates a progress report** — a Markdown file showing which strings still need translation, saved to `./reports/untranslated/`
2. **Splits the PO file** — breaks it into smaller files organised by source (one per game file), saved to `./reports/c-dda/`

> If your `.po` file has a different name or path, pass it explicitly:
> ```bash
> bun run src/cli.ts extract ./my-translations.po
> ```

### 4. Commit the results

```bash
bun run commit-po
```

This stages all generated files and creates a git commit with a message that includes the date from the `.po` file header, for example:
`Extracted PO files 2026-03-12 10:00+0000`

> **First time?** You may see a Git error asking you to set your name and email. Run these two commands once:
> ```bash
> git config --global user.name "Your Name"
> git config --global user.email "you@example.com"
> ```
> Then re-run `bun run commit-po`.

### 5. Sync to Transifex (optional)

Once your translations are committed, you can push the new or updated strings back to Transifex:

```bash
bun run sync-transifex --since HEAD~1   # sync changes from the last commit
bun run sync-transifex --dry-run        # preview what would be sent, without sending
```

> [!NOTE]
> After a successful sync, the tool automatically creates a git commit:
`Synced N translation(s) to Transifex YYYY-MM-DD HH:MM:SS+0000`
> This keeps your git history as a complete record of every upload — no manual bookkeeping needed.
> Add `--no-commit` if you want to skip the automatic commit.

See [Transifex Sync Setup](#transifex-sync-setup) below for the one-time API token configuration.

---

## Workflow

```
Download .po file from Transifex and copy it to the project folder.
         │
         ▼
   Remove reports folder if you already have one (optional, but recommended for a clean report)
         │
         ▼
   Run command: extract
         │
         ├─► Progress report (./reports/untranslated/)
         │
         └─► Split PO files (./reports/c-dda/)
         │
         ▼
   Run command: commit-po - to commit the changes to Git
         │
         ▼
   Run command: sync-transifex - to push changes back to Transifex.
         │
         ▼
   Return to step 1 (Download the updated .po file with new translations from Transifex)
```

> [!NOTE]
> After a successful sync, the tool automatically creates a git commit:
`Synced N translation(s) to Transifex YYYY-MM-DD HH:MM:SS+0000`
> This keeps your git history as a complete record of every upload — no manual bookkeeping needed.
> Add `--no-commit` if you want to skip the automatic commit.

---

## All Commands

All commands are run from the project folder.

### `extract` — Generate report + split PO file

```bash
bun run extract
# or with a custom file:
bun run src/cli.ts extract ./my-translations.po
```

Runs two steps automatically:
1. **Untranslated report** — Markdown progress report in `./reports/untranslated/`
2. **Split** — PO file split by source path into `./reports/c-dda/`

### `commit-po` — Commit the extracted files

```bash
bun run commit-po
# or with a custom file:
bun run src/cli.ts commit-po ./my-translations.po
# preview only:
bun run src/cli.ts commit-po ./my-translations.po --dry-run
```

Stages the input `.po` file and everything under `./reports/`, then commits with the message:
`Extracted PO files <POT-Creation-Date>`

### `sync-transifex` — Sync changes to Transifex

Uses `git diff` to detect changed translations and pushes them to the Transifex REST API.

```bash
bun run sync-transifex                  # detect changes vs last commit
bun run sync-transifex --since HEAD~1   # sync changes from last commit
bun run sync-transifex --since main     # sync all changes since main branch
bun run sync-transifex --dry-run        # preview without making API calls
bun run sync-transifex --yes            # skip interactive confirmation (CI)
bun run sync-transifex --force          # bypass regression safety block
bun run sync-transifex --no-commit      # skip the automatic git commit
```

After successfully pushing strings, a git commit is created automatically:
`Synced N translation(s) to Transifex YYYY-MM-DD HH:MM:SS+0000`

This removes the need to record uploads by hand and gives every translation push a permanent place in git history.

### `generate:report` — Low-level alternative to `extract`

Runs `report:untranslated` and `split` as separate processes (legacy shortcut):

```bash
bun run generate:report
```

### Advanced commands

```bash
bun run src/cli.ts report:untranslated translations.po --format console
bun run src/cli.ts report:untranslated translations.po --format markdown -o ./reports
bun run src/cli.ts report:untranslated translations.po --format json
bun run src/cli.ts report:untranslated translations.po --group-by file
bun run src/cli.ts split translations.po -o ./translations
bun run src/cli.ts check translations.po --format all
bun run src/cli.ts fix translations.po --dry-run
bun run src/cli.ts fix translations.po --backup
```

| `report:untranslated` option | Short | Description | Default |
|---|---|---|---|
| `--input <file>` | `-i` | Input `.po` file or glob pattern | positional arg |
| `--output <dir>` | `-o` | Output directory | `./reports` |
| `--format <fmt>` | `-f` | Output format: `console`, `markdown`, `json` | `console` |
| `--group-by <mode>` | `-g` | Group by: `file`, `source`, `none` | `source` |
| `--verbose` | `-v` | Print detailed progress | off |

---

## Language Support

The language is automatically inferred from the `Language:` field in the PO file header:

```
msgid ""
msgstr ""
"Language: de\n"
"Plural-Forms: nplurals=2; plural=(n != 1);\n"
```

For `sync-transifex`, set `TRANSIFEX_LANGUAGE` in your `.env` file.

**Plural forms** are inferred from the `Plural-Forms: nplurals=N; ...` header. The tool also uses built-in CLDR plural form name mappings (used by Transifex) for:

- 1-form languages: Japanese, Chinese, Korean, Vietnamese, Thai, ...
- 2-form languages: English, German, French, Spanish, Italian, Portuguese, ...
- 3-form languages: Latvian, Lithuanian, Romanian, ...
- 4-form languages: Russian, Ukrainian, Serbian, Polish, Czech, Slovak, ...
- 6-form languages: Arabic

---

## Transifex Sync Setup

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Fill in your credentials:
   ```env
   TRANSIFEX_API_TOKEN=<your token from https://www.transifex.com/user/settings/api/>
   TRANSIFEX_LANGUAGE=ru
   # TRANSIFEX_ORG=cataclysm-dda-translators
   # TRANSIFEX_PROJECT=cataclysm-dda
   # TRANSIFEX_RESOURCE=master-cataclysm-dda
   ```

The sync command:
- Finds changed `.po` files using `git diff`
- Compares current vs previous translations entry by entry
- PATCHes only entries whose `msgstr` changed
- Rate-limits to 500 requests/minute (120ms between requests)
- Maps plural form indices to CLDR names (`one`/`few`/`many`/`other` etc.) for the target language
