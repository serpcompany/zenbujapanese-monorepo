# Code rules and checks

The rules every change in this repository follows, whatever the language, and the checks that
enforce them. Each rule is checked mechanically, and each check's failure says how to fix it. The
checks are SERP's, shared by every SERP repository: `pnpm verify` runs `serp-verify` from
[`@serpcompany/verify`](https://github.com/serpcompany/serp/blob/main/packages/verify/README.md), configured by this repository's
[`verify.json`](../../verify.json), and SERP's [Verification](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/verification/README.md) standard defines each
one. This doc holds what is this repository's own: its rules' scope, its layers, and its exceptions.

Before opening a pull request, run `pnpm check` from the repository root: `pnpm verify`, then each
package's `pnpm check` (`apps/web`, `apps/dictionary-api`, `apps/account-api`,
`packages/dictionary-core`, `packages/node-service`, `tools/checks`), one after another. A change to
`language-data` also runs the pipeline's tests, and one to its sources, reports, or tools the data
tools' contract tests ([`language-data/README.md`](../../language-data/README.md)). A change is done when these pass and
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
([`lefthook.yml`](../../lefthook.yml), which extends the package's own). Before each commit they
check the staged files for comments, size, and secrets, and run each package's Biome on its staged
files. Before each push they run every shared check, then the fast check (lint, types, and unit tests, no build) of each package the
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
  `files` in [`verify.json`](../../verify.json) lists them by glob, with the tool, source, or
  checksum for each. One thing is pinned: the frequency packs' mapping SQL. Every
  published frequency pack carries its SHA-256, and the app refuses a pack whose mapping doesn't
  match, so changing even a comment there would break installed packs.

## File size

A code file (TypeScript, JavaScript, Swift, Python, or shell) has at most 500 lines. Split one that
outgrows it by responsibility, into files named for what each does.

There are no exceptions without a reason that makes splitting unsafe now, and none today. An
exception goes in `exceptions.knownLargeFiles` in [`verify.json`](../../verify.json), with its size
and that reason, and may only shrink: the check refuses an entry without a reason,
asks for an entry to be lowered as its file shrinks, and for it to go once the file is under the
limit.

## Duplicate code

Code says each thing once. When two places repeat a block of 5 lines or 50 tokens (TypeScript,
JavaScript, Swift, Python, or shell, tests included), move what they share into one function, type,
or test helper named for what it does, and call it from both. jscpd finds them (SERP's
[Duplicate check](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/verification/duplicate-check/README.md)).

There are no exceptions without a reason that makes sharing the code unsafe now, and none today. An
exception goes in `exceptions.knownDuplicates` in [`verify.json`](../../verify.json), as the pair
of files, how many blocks they repeat, and why, and may only shrink, as size exceptions do. The
language-data importers record their own SHA-256 in the data they build, so sharing code there
means rebuilding that data in the same pull request
([`language-data/tools/README.md`](../../language-data/tools/README.md)).

## Dead code

Nothing unused stays: no file nothing imports, no export only its own file uses, and no dependency
nothing imports. An agent copies or "fixes" dead code as readily as live code. Knip finds them from
each package's entry points ([`knip.json`](../../knip.json)); when it misses a real entry point, a
file a tool or runtime loads by name, name that file there rather than ignoring the finding.

## Imports

Imports point one way inside each part, and parts meet only where
[`ARCHITECTURE.md`](../../ARCHITECTURE.md) says. Biome checks each layer by import string, with a
message saying where the code belongs. dependency-cruiser checks the files those imports resolve
to, with each part's rules in `dependencies.parts` in [`verify.json`](../../verify.json):

- No import cycles, type-only ones included.
- Production code never imports a test or test support (`apps/web/src/test/`,
  `apps/dictionary-api/src/conformance/`, `packages/node-service/src/test/`), or a devDependency for
  more than its types.
- Every module in `apps/web`, `apps/dictionary-api`, `apps/account-api`, and `tools/checks` is
  reachable from an entry point: a route or `worker.ts`, each service's server (and the dictionary
  service's workers), the maintenance report. Code only tests use lives beside them.
- The core imports no Node built-in, package, app, or tool; apps reach a shared package by its
  name; no app imports another; and what the Node services share imports none of them.
- The website's layers by resolved path, and nothing `worker.ts` reaches loads Next.js or React.

## Secrets

No credential is committed, whatever the file: git history keeps it after a fix, and everyone with
access can read it. Secrets come from the environment: Wrangler secrets, GitHub Actions secrets,
and a gitignored `.dev.vars` or `.env` locally. Secretlint's recommended rules check every text
file (SERP's [Secrets check](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/verification/secrets-check/README.md)). If one is ever
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
  own: `No issue: <reason>`. `Part of #N` closes nothing: split the issue into sub-issues, one pull
  request each ([`issue-tracker.md`](issue-tracker.md)). Then why, what changed, what was left
  out, the evidence by level, the review's outcome, and Status, which a fresh agent starts from.
- **Bring a branch up to date by merging `main` into it,** not by rebasing, and merge a parent
  down into the branches stacked on it. Group stacked work into a few pull requests by what
  deploys together, not one per issue. `main` takes merge commits, through the merge queue.
- **Agents use GitHub as `serp-agent[bot]`,** not `gh auth switch` ([`ci-agents.md`](ci-agents.md)):
  `eval "$(bash ~/dev/repos/serp/skills/serp-github-app/scripts/env.sh)" && <command>`.

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
  outgrows it by topic. The docs over 300 when the check arrived are in
  `exceptions.knownLongDocs` in [`verify.json`](../../verify.json), each at its size: one may
  shrink but not grow, the check asks for its entry to be lowered as it shrinks, and for it to go
  once the doc fits. No new entry is added. The API references in
  `docs/api/` are written from code and ADRs are records, so neither has a budget.
- A service's API reference, `docs/api/<service>.md`, is written from its OpenAPI document by
  `packages/node-service/src/api-reference.ts`, and the service's tests fail when either file
  differs from what they write: change the routes, then run `pnpm test -u` in the service.
- Each skill under `.claude/skills/` has frontmatter naming it for its folder, with a description
  of at most 1,024 characters, and is listed in the Skills table below.
- Every link into a serpcompany repository opens, read through GitHub's API with a token
  (`SERP_VERIFY_GITHUB_TOKEN`, `GH_TOKEN`, or `GITHUB_TOKEN`; without one, a local run skips them
  and CI fails). A link GitHub hides from every reader is in `exceptions.hiddenLinks`, with its
  reason, until it opens again; that list only shrinks.
- A doc that shows a `gh` command links how an agent runs it as `serp-agent[bot]`
  ([`ci-agents.md`](ci-agents.md#outside-ci)), or is in `docs.github.exempt` with the reason its
  commands aren't an agent's. No folder is an archive (`archive/`, `old/`, `legacy/`): git keeps
  what was retired.

## Checks

Each rule above is checked mechanically, and [`checks.md`](checks.md) lists every check: what it
enforces, where it runs (`pnpm verify`, the edit, stop, and git hooks, the pull request checks,
and each package's `pnpm check`), and how `@serpcompany/verify` is installed here and in CI.

## Exceptions

A rule is never switched off in the code it flags: an inline directive is a comment, which the
comments check refuses. An exception is an entry in a central list, with its reason, that can only
shrink, or a rule turned off in a tool's config file. [`exceptions.md`](exceptions.md) lists both
kinds; add to it in the pull request that makes one.

## SERP's standards

This repository follows SERP's engineering standards, starting from
[Agent Harness](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/agent-harness/README.md)
and, for the checks, [Verification](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/verification/README.md).
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
| [`verify-app`](../../.claude/skills/verify-app/SKILL.md) | Check an app change in the running app: the UI tests that cover it, on this checkout's own Simulator, with the result kept as proof, and a recording and screenshots with `--record` |
| [`verify-service`](../../.claude/skills/verify-service/SKILL.md) | Check a change to the dictionary or account service by running it: the service started from this checkout on its own port, the routes the change touches called, and each answer kept as proof |
| [`finish-change`](../../.claude/skills/finish-change/SKILL.md) | Take a change to ready for a pull request: every check, a fresh review of the diff and of a website change's pages, the records, and the description |
| [`pr-review`](../../.claude/skills/pr-review/SKILL.md) | Review a pull request; the `Code review` workflow runs it on every push, then posts its summary to one comment it edits by id |
