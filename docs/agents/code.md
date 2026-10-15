# Code rules and checks

The rules every change in this repository follows, whatever the language, and the checks that
enforce them. Each rule is checked mechanically, and each check's failure says how to fix it.

Before opening a pull request, run `pnpm check` from the repository root: `pnpm verify`, then each
package's `pnpm check` (`apps/web`, `apps/dictionary-api`, `apps/account-api`,
`packages/dictionary-core`, `packages/node-service`, `tools/checks`), one after another. A change to `language-data` also runs the pipeline's tests
([`language-data/README.md`](../../language-data/README.md)). A change is done when these pass and
the docs say what changed: the product docs for a behavior (in the same pull request), the area's
doc for how it works. A website change also passes `pnpm test:e2e` in `apps/web`, with a browser test for any
behavior it adds and a regression test for any bug it fixes (the `browser-tests` skill). Check a
website change in a real browser with the `verify-web` skill, an app change in the running app
with the `verify-app` skill, and a service change by running the service with the
`verify-service` skill, and put what they showed in the pull request. The `finish-change`
skill walks an agent through all of this, with a fresh agent reviewing the diff, before it drafts
the pull request. What to run while editing and before a push, how to wait, and the evidence each
kind of change needs are in [`verification.md`](verification.md).

Git hooks run the fast checks before work leaves the machine: `pnpm install` installs them
([`lefthook.yml`](../../lefthook.yml)). Before each commit they check the staged files for comments,
size, and secrets, and run each package's Biome on its staged files. Before each push they run
`pnpm verify`, then the fast check (lint, types, and unit tests, no build) of each package the
branch changes against `origin/main`: the package itself, one that imports it, and every package
when the root's package files change. A branch that changes only docs or the app runs
`pnpm verify` alone. Fix what they report rather than skipping them; CI runs the same checks
either way.

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
- Markdown is prose, not code, but it hides nothing: an HTML comment (`<!-- -->`) is text that
  agents read and people reading the rendered doc don't see, so the docs check refuses one. The
  only ones allowed are the markers `next dev` writes around its block in `apps/web/AGENTS.md`.
- Files written by a tool (regenerated, never edited), third-party
  files, and files whose exact bytes a published checksum pins are left as they are:
  [`tools/checks/src/files.ts`](../../tools/checks/src/files.ts) lists them by name, with the tool,
  source, or checksum for each. One thing is pinned: the frequency packs' mapping SQL. Every
  published frequency pack carries its SHA-256, and the app refuses a pack whose mapping doesn't
  match, so changing even a comment there would break installed packs.

## File size

A code file (TypeScript, JavaScript, Swift, Python, or shell) has at most 500 lines. Split one that
outgrows it by responsibility, into files named for what each does.

There are no exceptions without a reason that makes splitting unsafe now, and none today. An
exception goes in `knownLargeFiles` in [`tools/checks/src/sizes.ts`](../../tools/checks/src/sizes.ts),
with its size and that reason, and may only shrink: the check refuses an entry without a reason,
asks for an entry to be lowered as its file shrinks, and for it to go once the file is under the
limit.

## Duplicate code

Code says each thing once. When two places repeat a block of 5 lines or 50 tokens (TypeScript,
JavaScript, Swift, Python, or shell, tests included), move what they share into one function, type,
or test helper named for what it does, and call it from both. jscpd finds them
([`tools/checks/src/duplicates.ts`](../../tools/checks/src/duplicates.ts)).

There are no exceptions without a reason that makes sharing the code unsafe now, and none today. An
exception goes in `knownDuplicates` in
[`tools/checks/src/known-duplicates.ts`](../../tools/checks/src/known-duplicates.ts), as the pair of
files, how many blocks they repeat, and why, and may only shrink, as size exceptions do. The iOS
data importers record their own SHA-256 in the language data they build, so sharing code there
means rebuilding that data in the same pull request ([`apps/ios/Tools/README.md`](../../apps/ios/Tools/README.md)).

## Dead code

Nothing unused stays: no file nothing imports, no export only its own file uses, and no dependency
nothing imports. An agent copies or "fixes" dead code as readily as live code. Knip finds them from
each package's entry points ([`knip.json`](../../knip.json)); when it misses a real entry point, a
file a tool or runtime loads by name, name that file there rather than ignoring the finding.

## Imports

Imports point one way inside each part, and parts meet only where
[`ARCHITECTURE.md`](../../ARCHITECTURE.md) says. Biome checks each layer by import string, with a
message saying where the code belongs. dependency-cruiser checks the files those imports resolve
to, with the rules in
[`tools/checks/src/dependencies.ts`](../../tools/checks/src/dependencies.ts):

- No import cycles, type-only ones included.
- Production code never imports a test or test support (`apps/web/src/test/`,
  `apps/dictionary-api/src/conformance/`, `packages/node-service/src/test/`), or a devDependency for
  more than its types.
- Every module in `apps/web`, `apps/dictionary-api`, `apps/account-api`, and `tools/checks` is
  reachable from an entry point: a route or `worker.ts`, each service's server (and the dictionary
  service's workers), the checks' commands. Code only tests use lives beside them.
- The core imports no Node built-in, package, app, or tool; apps reach a shared package by its
  name; no app imports another; and what the Node services share imports none of them.
- The website's layers by resolved path, and nothing `worker.ts` reaches loads Next.js or React.

## Secrets

No credential is committed, whatever the file: git history keeps it after a fix, and everyone with
access can read it. Secrets come from the environment: Wrangler secrets, GitHub Actions secrets,
and a gitignored `.dev.vars` or `.env` locally. Secretlint's recommended rules check every text
file ([`tools/checks/src/secrets.ts`](../../tools/checks/src/secrets.ts)). If one is ever
committed, have whoever issued it rotate it; deleting the line isn't enough.

## Fixes

A pull request from a `fix/` branch, or titled `fix:`, fixes a bug, so it adds or changes the test
that fails without the fix: a unit test, a browser test, a UI test, a conformance case, or a smoke
check. The `Pull request` workflow fails one that adds or changes no test; a deleted test or a
changed test helper doesn't count
([`tools/checks/pull-request.mjs`](../../tools/checks/pull-request.mjs) lists what does). A change
with nothing to fail without it, such as a typo or a workflow setting, isn't a fix: give it another
type (`chore`, `docs`).

## Pull requests

- **One issue, one branch, one pull request.** Branch from `main` as `<type>/<issue>-<slug>`, such
  as `fix/701-english-default-sort`, or `<type>/<slug>` when no issue covers the work. The type is
  the title's.
- **The title is a Conventional Commit** that names the outcome a user notices, such as
  `fix: Escape closes the Settings window`. The types are `feat`, `fix`, `perf`, `refactor`,
  `docs`, `test`, `build`, `ci`, and `chore`.
- **The body follows the template** (`.github/pull_request_template.md`). It starts with
  `Closes #<number>`, one line per issue it finishes, or says why there is none on a line of its
  own: `No issue: <reason>`. `Part of #N` closes nothing: split the issue into sub-issues, one
  pull request each ([`issue-tracker.md`](issue-tracker.md)). Then why, what changed, what was
  left out, the evidence by level, the review's outcome, and Status, which a fresh agent starts
  from.
- **Bring a branch up to date by merging `main` into it,** not by rebasing, and merge a parent
  down into the branches stacked on it. Group stacked work into a few pull requests by what
  deploys together, not one per issue. `main` takes merge commits, through the merge queue.

The `Pull request` workflow checks the title, the closing issue, and the test in a fix
([`ci.md`](ci.md), Pull request).

## Docs

The docs are the map agents work from, so they stay correct and reachable:

- Every relative link resolves, and so does every heading anchor (`#code-review`, or
  `ci-agents.md#code-review`), by GitHub's rules. Every repository path a doc names in code that starts at
  a top-level folder (`apps/`, `packages/`, `tools/`, `deploy/`, `docs/`, `language-data/`, `assets/`,
  `.github/`, or `.claude/`, such as `apps/web/scripts/smoke.sh` or `apps/web/worker.ts:12`) exists,
  from the repository root or from the doc's folder. A gitignored file counts as missing, so a run
  here and a run in CI agree. ADRs are records, so the path check skips them.
- Every `pnpm <script>` a doc runs, in code, is a script some `package.json` in the workspace
  defines, or the filtered package's own with `--filter` or `-C`.
- Every test a doc names in code exists: a test type or target (`SearchUITests`), a type's test
  (`SearchUITests.testAQueryWithNoMatchesSaysSo`), or a test function, in Swift, Python, or
  TypeScript. A product doc under `apps/<app>/docs/`, and a package's guide in `docs/agents/`, may
  name a path from the package's own folder (`src/lib/site.ts`), and it exists there.
- Every doc can be reached from `AGENTS.md` by following links. `AGENTS.md`, `CLAUDE.md`, the root
  `README.md`, and files under `.claude/` and `.github/` are entry points. A link to a folder
  reaches the Markdown files directly in it.
- Docs live where `AGENTS.md` routes: the root holds only `AGENTS.md`, `ARCHITECTURE.md`,
  `CONTEXT.md`, `README.md`, and `CLAUDE.md`, and `docs/` only `adr/`, `agents/`, `api/`, and its
  records. How an area works goes in `docs/agents/<area>.md`, a decision in `docs/adr/`, a
  service's API reference in `docs/api/`, and a product's behavior in `apps/<app>/docs/product/`.
  Under a docs folder, files and folders are named in kebab-case.
- Every doc keeps to a size budget, counted in lines wrapped at 100 characters, since an agent
  loads a whole doc to answer one question: 120 for a map (`AGENTS.md` and `CLAUDE.md` anywhere,
  and the root `README.md`), which only routes, and 300 for any other doc. Split a doc that
  outgrows it by topic. The docs over 300 when the check arrived are in `knownLongDocs` in
  [`tools/checks/src/doc-rules/budgets.ts`](../../tools/checks/src/doc-rules/budgets.ts), each at
  its size: one may shrink but not grow, the check asks for its entry to be lowered as it
  shrinks, and for it to go once the doc fits. No new entry is added. The API references in
  `docs/api/` are written from code and ADRs are records, so neither has a budget.
- A service's API reference, `docs/api/<service>.md`, is written from its OpenAPI document by
  `packages/node-service/src/api-reference.ts`, and the service's tests fail when either file
  differs from what they write: change the routes, then run `pnpm test -u` in the service.
- Each skill under `.claude/skills/` has frontmatter naming it for its folder, with a description
  of at most 1,024 characters, and is listed in the Skills table below.

## Checks

| Check | What it enforces | Where it runs |
| --- | --- | --- |
| `pnpm verify` | No comments, docs, file size, Swift layers, no XCUITest waits in UI tests, secrets, duplicate code, dead code, and imports ([`tools/checks`](../../tools/checks/)), then ShellCheck, actionlint, and Ruff | The `Repository` workflow, on every pull request and in the merge queue; the pre-push hook |
| `pnpm verify <checks> [paths]` | Some of the checks (`comments`, `docs`, `sizes`, `layers`, `waits`, `secrets`, `duplicates`, `deadcode`, `dependencies`, `linters`, comma-separated), on the given repository paths or on every file. `deadcode` always reads the whole workspace, and `dependencies` the packages the paths touch | By hand; the pre-commit hook runs `comments,sizes,secrets` on the staged files |
| `pnpm maintenance:report` | A Markdown report: the checks' failures; docs whose named files changed after the doc was edited; the quality rows whose Code changed after their Graded date ("Scores to re-grade"); known debt counted by Size, with the first small item; size and duplicate exceptions; the docs over their size budget; code files within 50 lines of the size limit; and, in the weekly `report` job, the review's findings of the last four weeks by part, with the parts that repeat (`tools/checks/src/report.ts`) | `Weekly maintenance`, on Mondays, where doc gardening and code gardening start from it ([`ci-agents.md`](ci-agents.md)); by hand |
| The edit hook | No comments, file size, Swift layers, and no secrets, on each file Claude Code writes, as it writes it (`.claude/settings.json`, `tools/checks/hook.mjs`). A file in a git worktree is checked by that worktree's own copy of the checks, since Claude Code runs the hook from the checkout the session started in. A checkout whose packages aren't installed says so rather than passing, except in a GitHub Actions job, which chose not to install. From Claude Code 2.1.295 a hook that crashes is reported too (`onFailure`); an older one ignores the setting | Claude Code sessions in this repository |
| The stop hook | The same four checks on every file changed since the last commit, and the docs check, before a turn ends (`tools/checks/stop-hook.mjs`). It catches what the edit hook can't see: a file a shell command rewrote, and a doc a change elsewhere made wrong. It reports the same failures once per session, and never holds a turn twice in a row. In a GitHub Actions job it does nothing: the jobs that run Claude there run the checks themselves, on a checkout the action has partly reset | Claude Code sessions in this repository |
| The git hooks | Before a commit, `comments,sizes,secrets` and each package's Biome on the staged files; before a push, `pnpm verify` and each changed package's lint, typecheck, and tests, without its build or the dictionary service's recorded suites, which take over a minute and need the app's data files ([`lefthook.yml`](../../lefthook.yml), `tools/checks/src/git-hooks.test.ts`) | Every clone after `pnpm install` |
| The pull request checks | A Conventional Commit title, a closing issue or a stated reason for none, and a test in every fix ([Fixes](#fixes), [Pull requests](#pull-requests)), from `tools/checks/pull-request.mjs`, which needs no install | The `Pull request` workflow, on every pull request, again when its title or body is edited |
| `pnpm check` | `pnpm verify`, then `pnpm check` in every package | By hand, before a pull request |
| `pnpm check` in a package | Biome (with the package's import and logging rules, and no non-null assertions), typecheck, tests, and its build | The package's workflow, on pull requests that change it |
| Generated files | The core's fixtures match what `pnpm --filter zenbujapanese-dictionary-api fixtures` exports from the language data, `apps/web/cloudflare-env.d.ts` matches what `pnpm cf-typegen` writes from `wrangler.jsonc`, and the app's bundle of the core matches what `pnpm --filter @zenbu/dictionary-core bundle:javascriptcore` writes (`packages/dictionary-core/src/embedded/bundle.test.ts`) | The `Dictionary API`, `Web`, and `Dictionary core` workflows |

`pnpm verify` lists files with `git ls-files`, so it checks new files before they're committed, and
skips ignored ones. It runs ShellCheck, actionlint, and Ruff in Docker, at the versions pinned in
[`tools/checks/src/linters.ts`](../../tools/checks/src/linters.ts), so a run here and a run in CI
agree. Without Docker it runs an installed copy instead, and with neither it says the linter
didn't run and passes; in CI a linter that can't run fails the check. Ruff reads
[`ruff.toml`](../../ruff.toml), and ShellCheck a `.shellcheckrc` beside a script. The checks' own
tests are in `tools/checks` (`pnpm check` there). `deadcode` and `dependencies` read every package,
so they need the whole workspace installed (`pnpm install`).

## Exceptions

A rule is never switched off in the code it flags: an inline directive is a comment, which the
comments check refuses. An exception is an entry in a central list, with its reason, that can only
shrink, or a rule turned off in a tool's config file. [`exceptions.md`](exceptions.md) lists both
kinds; add to it in the pull request that makes one.

## SERP's standards

This repository follows SERP's engineering standards, starting from
[Agent Harness](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/agent-harness/README.md).
What every SERP repository shares isn't restated here: how an orchestrator hands work to
subagents ([Token Budget](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/agent-harness/token-budget.md)),
the prompt a review starts from
([Review Prompt](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/agent-harness/review-prompt.md)),
and cleaning up after merged work
([Housekeeping](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/housekeeping.md)).
Where this repository differs from a standard, [`AGENTS.md`](../../AGENTS.md) lists it, and that
list wins.

## Skills

Claude Code loads these from `.claude/skills/` when a task matches; other agents can read them as
guides.

| Skill | Use it to |
| --- | --- |
| [`browser-tests`](../../.claude/skills/browser-tests/SKILL.md) | Run, debug, and add the website's Playwright tests, and read a failure from its trace and the server's log lines |
| [`verify-web`](../../.claude/skills/verify-web/SKILL.md) | Check a website change in a real browser, on `next dev`, the production build, or staging, and measure speed on the preview |
| [`verify-app`](../../.claude/skills/verify-app/SKILL.md) | Check an app change in the running app: the UI tests that cover it, on this checkout's own Simulator, with the result, a recording, and screenshots kept as proof |
| [`verify-service`](../../.claude/skills/verify-service/SKILL.md) | Check a change to the dictionary or account service by running it: the service started from this checkout on its own port, the routes the change touches called, and each answer kept as proof |
| [`finish-change`](../../.claude/skills/finish-change/SKILL.md) | Take a change to ready for a pull request: every check, a fresh review of the diff and of a website change's pages, the records, and the description |
| [`pr-review`](../../.claude/skills/pr-review/SKILL.md) | Review a pull request; the `Code review` workflow runs it on every push, then posts its summary to one comment it edits by id |
