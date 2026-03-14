# CDDA Translation Tool

Universal translation management and QA tool for **Cataclysm: Dark Days Ahead (CDDA)**.

Works with any CDDA-supported language. Integrates with Transifex (the official CDDA translation platform) and validates translation quality against language-agnostic rules.

> **What is a `.po` file?** A `.po` (Portable Object) file is the standard format used by many open-source projects to store translations. It is a plain text file containing pairs of original English strings and their translations. You download it from Transifex, work on your translations locally, then upload it back.

---

## Quick Start (no Git experience needed)

> **What is Git?** Git is a version-control system that keeps a full history of every change made to files. This tool uses it behind the scenes to track which strings you translated and when. You don't need to know the details — the commands below handle everything for you. The only requirement is that Git is installed on your computer.

### 1. Install the prerequisites

| Tool | Why you need it | Where to get it |
|------|-----------------|-----------------|
| [Git](https://git-scm.com/downloads) | Tracks changes and powers the Transifex sync | git-scm.com |
| [Bun](https://bun.sh) | Runs this tool | bun.sh |

After installing both, open a terminal **in the project folder** and run:

> **How to open a terminal in the project folder:**
> - **Windows:** Hold Shift and right-click the project folder in Explorer → "Open PowerShell window here" (or "Open in Terminal" on Windows 11).
> - **macOS:** Right-click the project folder in Finder → "New Terminal at Folder". *(If you don't see this option, enable it in System Settings → Keyboard → Keyboard Shortcuts → Services.)*
> - **Linux:** Right-click the project folder in your file manager → "Open Terminal Here". *(The exact wording depends on your file manager.)*

```bash
bun install
```

If it worked, you will see a few lines of output ending with something like `N packages installed`. No red "error" messages means everything is ready.

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
> `bun run extract` and `bun run src/cli.ts extract` call the same tool — `bun run extract` is just a shorter alias.

If it worked, you will see a list of created files scroll by with no red errors, and the `./reports/` folder will appear (or be updated) in your project folder.

### 4. Commit the results

```bash
bun run commit-po
```

This saves all generated files into Git with a message that includes the date from the `.po` file header, for example:
`Extracted PO files 2026-03-12 10:00+0000`

If it worked, you will see a line like: `[main abc1234] Extracted PO files 2026-03-12 10:00+0000`

> **First time?** You may see a Git error asking you to set your name and email. Run these two commands once:
> ```bash
> git config --global user.name "Your Name"
> git config --global user.email "you@example.com"
> ```
> Then re-run `bun run commit-po`.

### 5. Sync to Transifex (optional)

Once your translations are committed, you can push the new or updated strings back to Transifex:

```bash
bun run sync-transifex --since HEAD~1   # sync changes from the last commit ("one commit ago")
bun run sync-transifex --dry-run        # preview what would be sent, without actually sending anything
```

> [!NOTE]
> After a successful sync, the tool automatically creates a git commit:
`Synced N translation(s) to Transifex YYYY-MM-DD HH:MM:SS+0000`
> This keeps your git history as a complete record of every upload — no manual bookkeeping needed.
> Add `--no-commit` if you want to skip the automatic commit.

See [Transifex Sync Setup](#transifex-sync-setup) below for the one-time API token configuration.

---

## Workflow

Repeat this cycle every time you want to work on translations:

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
   Translate/Review strings in the splited PO files under ./reports/c-dda/ or ./reports/untranslated/
         │
         ▼
   Run command: sync-transifex - to push changes back to Transifex.
         │
         ▼
   Repeat from the top
```

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

Adds the input `.po` file and everything under `./reports/` to Git, then commits with the message:
`Extracted PO files <POT-Creation-Date>`

> **`commit-po` vs `sync-transifex` — what's the difference?**
>
> - **`commit-po`** takes a snapshot of the freshly downloaded `.po` file and saves it into Git. This snapshot represents *what is currently on Transifex* — a baseline. Run it every time you download a new or updated `.po` file.
> - **`sync-transifex`** compares your current files against that baseline using Git, finds every string you changed since the download, and uploads only those changes to Transifex.
>
> In other words: `commit-po` records *where you started*, and `sync-transifex` figures out *what you changed* by looking at the difference between now and that starting point. Without the `commit-po` snapshot, `sync-transifex` has no reference to compare against.

### `sync-transifex` — Sync changes to Transifex

Uses `git diff` to detect changed translations and pushes them to the Transifex REST API.

```bash
bun run sync-transifex                  # sync translations changed since your last save (commit)
bun run sync-transifex --since HEAD~1   # sync only translations changed in the previous save
bun run sync-transifex --since main     # sync all translations changed since the main branch
bun run sync-transifex --dry-run        # preview what would be uploaded — nothing is actually sent
bun run sync-transifex --yes            # skip the "are you sure?" prompt (useful for automation)
bun run sync-transifex --force          # upload even if a large number of changes is detected (see FAQ)
bun run sync-transifex --no-commit      # do not create a git save-point after uploading
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

> **`bun run` vs `bun run src/cli.ts`:** `bun run <name>` is a shortcut for the most common commands (defined in `package.json`). `bun run src/cli.ts` runs the tool directly and supports every command and option. Both call the same tool — when a shortcut doesn't exist for what you need, use `bun run src/cli.ts`.

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
   *(On Windows without Git Bash, use: `copy .env.example .env`)*

2. Get your Transifex API token:
   - Log in to [Transifex](https://www.transifex.com).
   - Click your **avatar** (top-right corner) → **Settings**.
   - Go to the **API token** tab → click **Generate a token**.
   - Copy the token — you will only see it once.

3. Open the `.env` file in a text editor and fill in your details:
   ```env
   TRANSIFEX_API_TOKEN=paste-your-token-here
   TRANSIFEX_LANGUAGE=ru
   # TRANSIFEX_ORG=cataclysm-dda-translators
   # TRANSIFEX_PROJECT=cataclysm-dda
   # TRANSIFEX_RESOURCE=master-cataclysm-dda
   ```
   Replace `ru` with your own language code if you are not translating Russian. Lines starting with `#` are comments — leave them as-is unless you are working on a fork of CDDA.

The sync command:
- Finds changed `.po` files using `git diff`
- Compares current vs previous translations entry by entry
- PATCHes only entries whose `msgstr` changed
- Rate-limits to 500 requests/minute (120ms between requests)
- Maps plural form indices to CLDR names (`one`/`few`/`many`/`other` etc.) for the target language

---

## Troubleshooting / FAQ

### "command not found: bun"

Bun was not installed correctly, or the terminal was opened before installation finished. Close and reopen your terminal, then try `bun --version`. If that still fails, revisit [bun.sh](https://bun.sh) and follow the installation instructions for your operating system.

### "command not found: git"

Git is not installed. Download it from [git-scm.com](https://git-scm.com/downloads), install it, then restart your terminal.

### Git asks you to set your name and email

You need to identify yourself to Git once. Run these two commands (replace with your own details) in terminal at the project folder:
```bash
git config user.name "Your Name"
git config user.email "you@example.com"
```
Then re-run the command that failed. Your credentials aren't shared with anyone — they are only stored locally on your computer to keep track of who made which changes.

### The `.po` file is not found

Make sure you placed the file directly inside the project folder (not in a sub-folder) and that the file name matches exactly what you typed. File names are case-sensitive on Linux and macOS.

### `sync-transifex` prints "401 Unauthorized"

Your API token in the `.env` file is wrong, incomplete, or expired. Generate a new one on Transifex (see [Transifex Sync Setup](#transifex-sync-setup)) and update the `.env` file.

### The tool warns about a large number of changes

This is a safety feature to prevent accidentally overwriting many strings at once. Double-check that your changes are correct, then re-run with `--force` to proceed anyway.

### On Windows, `cp .env.example .env` says "not recognised"

Use the Windows equivalent: `copy .env.example .env`. This works in both Command Prompt and PowerShell. If you are using Git Bash, `cp` should work fine.

---

## Glossary

| Term | Meaning |
|------|---------|
| `.po` file | A plain text file containing translation pairs (original English + translation). The standard format for open-source translations. |
| `.env` file | A local configuration file where you store private settings such as API tokens. It is never shared or committed to Git. |
| Commit | A saved snapshot of your files in Git — like a named save point. The tool creates commits automatically so you always have a history of your work. |
| Dry run (`--dry-run`) | A mode that shows what a command *would* do without actually doing it. Safe to run at any time. |
| API token | A secret key that proves your identity to a web service like Transifex. Treat it like a password — never share it. |
| `HEAD~1` | Git shorthand for "the previous save point". `HEAD` refers to the latest commit; `~1` means "one step back". |
| CLDR | Common Locale Data Repository — an international standard that defines how plural forms are named (e.g. "one", "few", "many", "other"). |
| Glob pattern | A wildcard file path — for example, `*.po` means "every file whose name ends in `.po`". |
| `msgstr` | The field inside a `.po` file that holds the translated text (as opposed to `msgid`, which holds the original English). |
