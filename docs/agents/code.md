# Code rules and checks

The rules every change in this repository follows, whatever the language, and the checks that
enforce them. Each rule is checked mechanically, and each check's failure says how to fix it.

Before opening a pull request, run `pnpm verify` from the repository root, and `pnpm check` in each
package you changed (`apps/web`, `apps/dictionary-api`, `packages/dictionary-core`,
`tools/checks`). A change is done when both pass and the docs say what changed: the product docs
for a behavior (in the same pull request), the area's doc for how it works. Check a website change
in a real browser with the `verify-web` skill (`.claude/skills/verify-web/`), and put what it
showed in the pull request.

## No comments

Code has no comments, with no exceptions. Code says what it does through its names: values,
functions, types, and tests named for what they mean, a step that needs explaining moved into a
function named for it, and a magic number given a named constant. Why it's built that way, and how
the parts fit together, is in the docs: the doc [`AGENTS.md`](../../AGENTS.md) routes to for that
code, the product docs for behavior, and an ADR for a decision.

The rule covers every language here: TypeScript and JavaScript (JSDoc and JSX comments too),
Swift (`///` and `// MARK:` too), Python (comments, docstrings, and any other string used as a
statement), shell, YAML (and the shell in a workflow's `run:` blocks), Dockerfiles, SQL, CSS, JSON,
TOML, XML, and ignore files.

- A tool directive is a comment too. Configure the tool in its config file instead (a `biome.json`
  override, a Ruff per-file ignore, a Vitest project), or change the code so it needs none.
- Commented-out code is deleted: git history keeps it.
- A file's first line may be what its format requires: a shebang (`#!/usr/bin/env bash`), and
  `// swift-tools-version:` in `Package.swift`. Tools read these; they aren't comments.
- Markdown is prose, not code. Files written by a tool (regenerated, never edited), third-party
  files, and files whose exact bytes a published checksum pins are left as they are:
  [`tools/checks/src/files.ts`](../../tools/checks/src/files.ts) lists them by name, with the tool,
  source, or checksum for each. The frequency packs' mapping SQL is the one pinned file: every
  published frequency pack carries its SHA-256, and the app refuses a pack whose mapping doesn't
  match, so changing even a comment there would break installed packs.

## File size

A code file (TypeScript, JavaScript, Swift, Python, or shell) has at most 500 lines. Split one that
outgrows it by responsibility, into files named for what each does. Files that were already over
the limit are listed in [`tools/checks/src/sizes.ts`](../../tools/checks/src/sizes.ts) with their
size, and may only shrink: the check asks for the entry to be lowered as a file shrinks, and
removed once it's under the limit.

## Docs

The docs are the map agents work from, so they stay correct and reachable:

- Every relative link resolves, and every repository path a doc names in code (such as
  `apps/web/scripts/smoke.sh`) exists, from the repository root or from the doc's folder. ADRs are
  records, so the path check skips them.
- Every doc can be reached from `AGENTS.md` by following links. `AGENTS.md`, `CLAUDE.md`, the root
  `README.md`, and files under `.claude/` and `.github/` are entry points. A link to a folder
  reaches the Markdown files directly in it.

## Checks

| Check | What it enforces | Where it runs |
| --- | --- | --- |
| `pnpm verify` | No comments, docs, and file size ([`tools/checks`](../../tools/checks/)), then ShellCheck, actionlint, and Ruff | The `Repository` workflow, on every pull request |
| `pnpm verify <check> [paths]` | One check (`comments`, `docs`, `sizes`, or `linters`), on the given repository paths or on every file | By hand |
| The edit hook | No comments and file size, on each file Claude Code writes, as it writes it (`.claude/settings.json`) | Claude Code sessions in this repository |
| `pnpm check` in a package | Biome (with the package's import rules), typecheck, tests, and its build | The package's workflow, on pull requests that change it |

`pnpm verify` lists files with `git ls-files`, so it checks new files before they're committed, and
skips ignored ones. It runs ShellCheck, actionlint, and Ruff in Docker, at the versions pinned in
[`tools/checks/src/linters.ts`](../../tools/checks/src/linters.ts), so a run here and a run in CI
agree. Without Docker it runs an installed copy instead, and with neither it says the linter
didn't run and passes; in CI a linter that can't run fails the check. Ruff reads
[`ruff.toml`](../../ruff.toml), and ShellCheck a `.shellcheckrc` beside a script. The checks' own
tests are in `tools/checks` (`pnpm check` there).
