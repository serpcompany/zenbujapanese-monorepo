# GitHub Actions working guide

The workflows are in `.github/workflows/`, and the one action they share is in
`.github/actions/package-language-data/`. Workflow files hold no comments ([`code.md`](code.md),
No comments), so what starts each one, what it runs, and why it's built that way are here. Change
a workflow's section in the same pull request as the workflow.

Every job runs on `ubuntu-latest` and reads the repository's contents only, unless its section
says otherwise. The pnpm jobs set up pnpm from the root `package.json` and Node 22, and install
with `pnpm install --frozen-lockfile`.

| Workflow | File | Starts on |
| --- | --- | --- |
| `Repository` | `.github/workflows/repository.yml` | Every pull request |
| `Code review` | `.github/workflows/code-review.yml` | Every pull request that isn't a draft |
| `Claude` | `.github/workflows/claude.yml` | `@claude` in an issue, a pull request comment, a review, or a review comment |
| `Weekly maintenance` | `.github/workflows/maintenance.yml` | Mondays at 14:00 UTC; by hand, every job or one |
| `Web` | `.github/workflows/web.yml` | Pull requests that change the site or the core |
| `Web deploy` | `.github/workflows/web-deploy.yml` | Pushes to `main` that change the site or the core; by hand |
| `Dictionary core` | `.github/workflows/dictionary-core.yml` | Pull requests that change the core |
| `Dictionary API` | `.github/workflows/dictionary-api.yml` | Pull requests that change the service or what it reads; pushes to `main` that change its cached files; by hand |
| `Dictionary API deploy` | `.github/workflows/dictionary-api-deploy.yml` | Pushes to `main` and pull requests that change what the image holds; by hand |
| `Account API` | `.github/workflows/account-api.yml` | Pull requests that change the account service or what the services share; by hand |
| `Account API deploy` | `.github/workflows/account-api-deploy.yml` | Pushes to `main` and pull requests that change what the image holds; by hand |
| `iOS` | `.github/workflows/ios.yml` | Pull requests that change `apps/ios`; by hand |
| `Search parity` | `.github/workflows/search-parity.yml` | Pull requests that change a Swift source or a TypeScript port it pairs |
| `Language data build` | `.github/workflows/language-data-build.yml` | Pull requests and pushes to `main` that change a release's inputs |
| `Language data release` | `.github/workflows/language-data-release.yml` | Pushes to `main` that change a release's inputs; by hand |

"The core" is `packages/dictionary-core`, and a change to the root `package.json`,
`pnpm-lock.yaml`, or `pnpm-workspace.yaml` counts as changing it. A change to a workflow's own file
starts it too, except for `Search parity`.

## Repository

`.github/workflows/repository.yml` runs on every pull request; a new push cancels the pull
request's last run. It installs the whole workspace, since the dead-code and import checks read
every package, then runs the checks' own `pnpm check` (`tools/checks`), then `pnpm verify`: no
comments, docs, file sizes, secrets, duplicate code, dead code, imports, and the linters. On a pull
request from a `fix/` branch it then checks that the pull request changes a test (`fix-branch`,
comparing the merge commit with its first parent, which is why it checks out two commits). What
each enforces is in [`code.md`](code.md), Checks.

## Code review

`.github/workflows/code-review.yml` has Claude review every push to a pull request that isn't a
draft or opened by a bot, with the repository's `pr-review` skill
(`.claude/skills/pr-review/SKILL.md`): three reviewers in parallel (bugs, rules, and tests and
docs), each new finding as an inline comment, and one summary comment it updates on every review.
Its check doesn't block merging, since `main`'s ruleset requires no checks, but the ruleset does
require every review conversation to be resolved, so an inline finding blocks merging until it's
fixed or answered and resolved. A finding can be answered with an `@claude` request in its thread
(@claude requests, below). How it's built, and why:

- **The skill and the rules come from the base branch.** The action replaces `CLAUDE.md`,
  `.claude/`, and `.mcp.json` with the base branch's copies before Claude starts, so a pull request
  can't rewrite its own review, and a `CLAUDE.md` written on the runner is lost. The job copies
  `AGENTS.md`, `ARCHITECTURE.md`, [`code.md`](code.md), and `CONTEXT.md` from the base branch into
  a file outside the checkout and hands it to Claude and every subagent
  (`--append-system-prompt-file`, `--append-subagent-system-prompt-file`), so a pull request can't
  weaken the rules it's reviewed against either.
- **A re-review raises only what's new, and edits one summary.** Before Claude starts, the job
  adds to that file the top-level inline findings `claude[bot]` posted on the pull request and
  the summary: the latest comment by `github-actions[bot]` that starts with `## Claude review`.
  Claude posts only inline findings. It writes the summary to `tmp/review-summary.md`, and a step
  after it posts that file with the job's own token, editing the earlier summary by id or
  creating one, never the latest comment, which can be an answer to an
  `@claude` request. The step refuses a file without the heading or too long for a comment, and
  the job deletes any `tmp/review-summary.md` the pull request carries before Claude starts.
  The token needs `pull-requests: write`: GitHub refuses a comment on a pull request from a job
  token with only `issues: write` (403).
  Claude's answers to `@claude` requests, and its replies in review threads, are passed in as
  context only, never as findings. The summary says whether each earlier finding is fixed.
- **It reviews the pushes `@claude` makes.** `allowed_bots: "claude[bot]"` lets the review run on
  a push an `@claude` request made to the pull request, whose actor is then a bot. A pull request
  a bot opened, such as a gardening one, isn't reviewed.
- **Subagents stay in the foreground** (`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`). Claude Code runs
  them in the background by default, and the action stops at Claude's first result, so a review
  would end green having posted nothing (anthropics/claude-code-action#1646).
- **The model is pinned** (`--model`), so an action update can't change it, and
  `--strict-mcp-config` keeps `.mcp.json`'s servers, such as Chrome, out of CI. `--allowedTools`
  lists every tool in the skill's `allowed-tools`. Naming Glob and Grep there brings those tools
  back on Linux, where Claude Code otherwise searches with `grep` and `find` in Bash.
- **The settings never block what a CI job uses.** The action restores `.claude/` from the base
  branch, so `.claude/settings.json` applies in CI, where an ask rule can't prompt and so denies.
  Its rules therefore never deny or ask for a tool a Claude job uses: the tools in each job's
  `--allowedTools`, Read, Glob, and Grep, `git push` to a branch, and `gh pr create`. Every
  `gh api` write still asks, which is why the review's summary is posted by a workflow step
  rather than by Claude. `tools/checks/src/agents/settings.test.ts` checks both directions: every
  package script that deploys is asked, and nothing a Claude job in any workflow runs is.
- **The check fails unless Claude posted.** After the review, a script fails the job when Claude
  left no log, ended in an error, ended with subagents still running, or posted and updated
  nothing during the run; a denied tool fails it only when nothing was posted. It counts only the
  review's own output: the summary, top-level inline comments, and reviews, not an answer to an
  `@claude` request. It runs inline because the job can mint an OIDC token, so it runs no script
  from the pull request.
- **The transcript is kept** for a week as the `claude-review-transcript` artifact: the action's
  own log shows counts only. The step summary shows each run's turns, time, estimated cost, and
  models.

The inline scripts are tested by running them as the workflow does, against a stand-in for the
GitHub API (`tools/checks/src/agents/code-review.test.ts`).

It runs with the `CLAUDE_CODE_OAUTH_TOKEN` repository secret, which is set; without it the job
only notes that it skipped (Claude's app and token, below). The action skips a pull request that
changes this workflow, which must match `main`'s, so that pull request's `review` check fails
saying no review happened: expected, and no reason to hold it. So a change to a Claude workflow
can't be tried on its own pull request; try it in a throwaway repository with the same workflow,
skill, and rules first. Making merges wait for its check is a branch rule the owners decide.

## @claude requests

`.github/workflows/claude.yml` answers `@claude` in an issue, a pull request comment, a review,
or a review comment, from the repository's owners, members, and collaborators, and never from a
bot, so Claude's own comments can't start it again. The repository is public, so the job checks
the commenter's association before it does anything: otherwise a stranger's `@claude` on their
own fork's pull request would check out and install that pull request with the job's tokens.
It also skips, with a notice, a pull request whose branch is in a fork, whoever asks: checking it
would run the fork's code with this repository's tokens, and Claude can't push to it. One run per
issue or pull request goes at a time, and a new one waits rather than cancelling it. The job, not
the workflow, holds that queue, so a comment that doesn't ask can't displace a waiting request.
GitHub keeps only one waiting run per queue, though: a third request while one runs and one
waits replaces the waiting one, so ask again after the first finishes.

- **Where it works.** On a pull request it checks out the pull request's head and may push fixes
  to its branch, which starts a re-review (Code review, above); on an issue it branches from
  `main` and links a pull request to open. It sets up pnpm and Node as `Repository` does and
  installs every package (`pnpm install --frozen-lockfile --ignore-scripts --ignore-pnpmfile`, so
  no install script or pnpmfile hook runs), since the edit hook needs the checks' dependencies and
  a fix may touch any package. The checkout keeps no token in the working tree (`persist-credentials: false`); the
  action sets up its own for pushing. It runs the pull request's own code when it checks it, so
  ask it only on a pull request whose code you trust.
- **The rules it follows.** A file appended to its system prompt says to follow `AGENTS.md`,
  `ARCHITECTURE.md`, [`code.md`](code.md), and `CONTEXT.md`; before pushing, to run `pnpm verify`
  and then `pnpm check` for each package it changed, and to push nothing and say why if one still
  fails; that a Swift change can't be built on the runner ([`ios.md`](ios.md)), so it says so;
  to stage files by path; and never to push to `main`. Blanket adds (`git add -A`, `.`, `-u`, and
  `git commit -a`) are refused with `--disallowedTools`: on a pull request the action resets
  `.claude/`, `.mcp.json`, and `CLAUDE.md` to the base branch's copies, and a blanket add would
  commit that reset. Its commits keep the Co-Authored-By trailer Claude Code adds, by the owner's
  decision.
- **Its limits.** `--max-turns 60`, a 45-minute timeout, and `BASH_DEFAULT_TIMEOUT_MS` of 15
  minutes, since `pnpm check` builds the site and `pnpm verify` runs its linters in Docker. Like
  the review, it pins the model, keeps subagents in the foreground, leaves the MCP servers out, and
  keeps its transcript (`claude-transcript`).
- **The check after it.** A script reads Claude's log and the branch. It passes when Claude
  answered in its comment or pushed, fails when Claude did neither, ended in an error, or ended
  with subagents running, and warns when a commit changes a file the action resets or Claude
  pushed without replying (`tools/checks/src/agents/claude-workflow.test.ts`).

It uses the same app and token as the review, and like the review it runs only once its workflow
file matches `main`'s.

## Weekly maintenance

`.github/workflows/maintenance.yml` runs every Monday, and by hand from the Actions tab, where
"Which job to run" picks one job or all of them. Each job starts from `pnpm maintenance:report`
(`tools/checks/src/report.ts`), a Markdown report built only from the repository: the checks'
failures; the docs whose named or linked files changed after the doc was last edited; the rows of
[`quality.md`](../quality.md) whose Code changed after their Graded date ("Scores to re-grade");
the known debt, counted by Size with the first small item named
([`tech-debt.md`](../tech-debt.md)); the size exceptions; and the code files within 50 lines of
the size limit (to split before a change has to). A job writes it under `tmp/`, which git
ignores: a Markdown file at the repository root would fail the docs check the report runs.

- **`doc-gardening`**: unless a "Weekly doc gardening" pull request is already open, Claude takes up
  to eight docs from the report, checks each against the code, and fixes what's no longer true in
  Markdown only (never an ADR, code, or a workflow). It re-grades each row under "Scores to
  re-grade" and sets its Graded date, even when the grade stays the same, and updates
  [`tech-debt.md`](../tech-debt.md). It runs `pnpm verify docs` and opens one pull request into
  `main` from `docs/gardening-<date>`, with its body written to `tmp/pr-body.md`: each doc changed,
  each row re-graded with its old and new grade, and the docs checked without changes. It installs
  every package, since the report it starts from runs the dead-code and import checks.
- **`code-gardening`**: unless a `chore/code-gardening-` pull request is still open, Claude fixes
  one item in one pull request into `main`: the first `small` row of
  [`tech-debt.md`](../tech-debt.md), or else one file near the size limit, split by
  responsibility. It passes over an item that needs a deploy, a language-data release or anything
  in R2, a change under `apps/ios` or in Swift (the runner can't build or test it), a product
  doc's behavior or wording, an ADR-level decision, or another decision a person makes. It deletes
  the row it fixed, writes no code comments, runs `pnpm check`, and opens a pull request from
  `chore/code-gardening-<date>`, or says "Nothing to garden". It installs every package, since
  `pnpm check` checks them all, and has 60 minutes.
- **`report`** installs every package, as doc gardening does, and posts the report as one open issue, "Weekly repository maintenance", labelled
  `ready-for-agent`, and edits it each week rather than opening another.

Both gardening jobs pin the model (`--model`), keep subagents in the foreground, give each Bash
command 15 minutes (`BASH_DEFAULT_TIMEOUT_MS`), leave the MCP servers out, and keep their
transcripts (`doc-gardening-transcript`, `code-gardening-transcript`). A script after each prints
what Claude said and passes only on an outcome. Doc gardening's: a gardening pull request opened
during the run, "No doc drift found", or an open one left alone. Code gardening's: exactly one
pull request opened, or "Nothing to garden"; a second pull request fails it. Both fail when Claude
left no log, ended in an error or with subagents running, or reached no outcome, and a denied tool
only warns when Claude got there anyway, since it often retries a refused command another way
(`tools/checks/src/agents/maintenance-workflow.test.ts`). A bot opens their pull requests, so
`Code review` skips them: skim each and merge it.

Work the issue in small pull requests, one item each:

1. **Checks and docs:** fix a failing check, or a doc the gardening pull request left unresolved.
2. **Scores:** re-grade a row under "Scores to re-grade" and set its Graded date.
3. **Debt:** pay down one row of [`tech-debt.md`](../tech-debt.md), and delete it.
4. **Size:** split one file the report lists as near the 500-line limit, by responsibility.
5. **Harness:** if recent reviews repeat a mistake, add it to [`code.md`](code.md) and, where
   possible, a check whose message says how to fix it.

The gardening jobs run with `CLAUDE_CODE_OAUTH_TOKEN` too, and skip without it; the report needs
no token.

## Claude's app and token (admin only)

The review, `@claude`, and gardening jobs authenticate as the Claude GitHub App and run on a
Claude subscription. An admin sets them up once:

1. Install the [Claude GitHub App](https://github.com/apps/claude) on this repository. The action
   posts comments and pushes as the app (`claude[bot]`).
2. On a machine with Claude Code signed in to a Pro, Max, Team, or Enterprise plan, run
   `claude setup-token`, and save the token it prints as the repository secret
   `CLAUDE_CODE_OAUTH_TOKEN`.

The token belongs to whoever generated it: every run counts against their plan's usage limits,
beside the Actions minutes. If their plan changes, or runs start failing to authenticate,
regenerate it and replace the secret.

## Web

`.github/workflows/web.yml` runs on pull requests that change `apps/web/**` or the core. In
`apps/web`, it runs ShellCheck 0.11 on the scripts in `apps/web/scripts/`, at warning level, in
Docker, since the runner's own ShellCheck is older; checks that `cloudflare-env.d.ts` is what
`pnpm cf-typegen` writes from `wrangler.jsonc`, and that it writes no other file, so a binding
changed without regenerating the types fails here; then `pnpm check` ([`web.md`](web.md), Run and verify); then it builds twice more, with
`SITE_ENV=staging` and with `SITE_ENV=production`. `pnpm check` builds without `SITE_ENV`, but
static pages and prerendering differ by environment, so a route that reads a binding at build time
fails only in that environment's build. Neither build reaches the dictionary service: deployed
pages read it only at request time. After staging's, it checks the prerendered `/about/` has the
footer's Sign in linking `/login/`, since staging's account pages are open
([`web.md`](web.md), Account pages); the header's Log in is in the account menu, which the browser
draws, so `src/lib/site.test.ts` checks its address with the account pages open and closed. The `e2e` job checks
production's has none. Each step names `apps/web` as its working directory, rather
than the jobs setting it as a default, because the dead-code check reads a step's working directory
to find the scripts and binaries a step runs, and not a job's.

Its `e2e` job runs the browser tests ([`web.md`](web.md), Run and verify) on the site as it
deploys: it installs Chromium, builds with OpenNext without `SITE_ENV`, so the build reads the
dictionary fixtures, and serves it in workerd with `opennextjs-cloudflare preview`. A test that
fails is retried once, and Playwright reports one that passed on the retry as flaky. Then it
builds again as production deploys (`SITE_ENV=production`, with a test `NEXT_PUBLIC_GTM_ID`,
since `Web deploy` passes the real one) and runs `e2e/account-closed.spec.ts`
on that build, served by `wrangler dev` with production's vars, no dictionary service, and no
`.dev.vars` or `.env` file: while production's
`ACCOUNT_API_URL` is empty, each account page says signing in isn't available and asks the
account service nothing, and nothing links to one, the account menu's Log in and Create an
account (still `#`) and the prerendered footer included. When production's account pages open, those two steps go
with it ([`web.md`](web.md), Account pages). On a failure
it uploads the report, traces, videos, and screenshots as the `playwright-report` artifact, kept
for a week.

## Web deploy

`.github/workflows/web-deploy.yml` deploys the site on a push to `main` that changes the same files
as `Web`, and by hand. Runs never overlap, and a running one is never cancelled. The `staging`
job, then the `production` job, each in the GitHub environment of that name:

1. waits for this commit's `Dictionary API deploy` run, if it has one, to sign and tag the image
   for the environment (`apps/web/scripts/wait-for-dictionary-service.sh`, up to 20 minutes), so a
   commit that changes both ships the service first; a run that failed, skipped the environment,
   or was cancelled stops it. The workflow's `actions: read` permission lets it see that run. It
   can't see the server deploy: Bot Fight Mode on the zone challenges CI runners
   ([`dictionary-api.md`](dictionary-api.md), How a deploy works).
2. points the site at the environment's service (`apps/web/scripts/use-dictionary-service.sh`, with
   the environment's `DICTIONARY_API_URL` variable);
3. deploys and smoke-tests (`apps/web/scripts/smoke.sh`)
   the workers.dev URL the deploy printed, since the zone's bot protection blocks CI runners. When
   Cloudflare challenges the site's Worker for the runner too, the smoke test skips its dictionary
   checks with a warning ([`web.md`](web.md), Dictionary service).

Production runs once staging passes. Its environment has no required reviewer, by the owner's
decision; add one to gate it by hand. The repository variable `DEPLOY_PRODUCTION` set to `false`
stops pushes at staging; a run by hand still deploys production. The production build gets
`NEXT_PUBLIC_GTM_ID`, the public analytics ID, from the `production` environment's variables. The
environments, the secrets, and the SERP standard the deploy follows are in [`web.md`](web.md),
Environments and deploys.

## Dictionary core

`.github/workflows/dictionary-core.yml` runs `pnpm check` in `packages/dictionary-core` (Biome with
its rule that keeps runtimes and frameworks out, typecheck, and Vitest) on pull requests that change
the core. Those tests need no data: the app-recorded suites run through the core in
`Dictionary API`, and `Web` builds the site with it. See [`dictionary-core.md`](dictionary-core.md).

## Dictionary API

`.github/workflows/dictionary-api.yml` checks the dictionary service on pull requests that change
the service, the core, what the services share (`packages/node-service/`), its API reference
(`docs/api/dictionary-api.md`, which its tests write), the website's
dictionary code (`apps/web/src/lib/dictionary/`,
`apps/web/src/components/dictionary/`, `apps/web/src/test/`, `apps/web/vitest.config.ts`), the conformance suites
(`apps/ios/LanguageData/Conformance/`), the app's resources
(`apps/ios/Modules/Sources/SearchExperience/Resources/`), or `language-data/release.json` (the
release the service names), and by hand. A new push cancels the pull request's last run. Its
`scripts` job runs ShellCheck 0.11 on the server's deployer (`deploy/deployer.sh`), in Docker,
since the runner's own ShellCheck is older; `Repository`'s `pnpm verify` runs ShellCheck on it
too, on any pull request that changes it. Its `check` job:

1. restores and pulls the app's Git LFS files the service reads (the `.sqlite3` files and
   Kuromoji's), then Sudachi's dictionary (`pnpm sudachi`, which keeps a cached copy that matches
   the app's pin, or downloads and checks it);
2. runs `pnpm check` in `apps/dictionary-api`: Biome, typecheck, the app-recorded suites on the
   real files, and the bundle;
3. exports the core's fixtures from the real files and fails if they differ from the committed
   ones (`packages/dictionary-core/src/fixtures/`) or add a file, so a data rebuild that changes a fixture word's
   rows re-exports them in the same pull request;
4. starts the built service and runs the website's rendered-page gate against it
   ([`web.md`](web.md), The rendered-page gate), and prints the service's log if a step failed.

`ZENBU_REQUIRE_ARTIFACT=1` makes the suites fail, rather than skip, without the app's files or
Sudachi's dictionary. `DICTIONARY_API_TOKEN` is a CI-only value that only this job's service and
gate use.

The Git LFS files (about 520 MB) are cached under a hash of their pointers, so a run downloads them
only when they change, and Sudachi's dictionary under a hash of the app's pin
(`apps/ios/Modules/Sources/SearchExperience/Resources/LanguageTechnologyPackCatalog.json`). A pull
request's cache is visible only to that pull request, so the workflow also runs on a push to
`main` that changes those files, the pin, or the workflow: that run builds the caches every later
pull request restores. `Dictionary API deploy` uses the same Git LFS cache key, so the two share
it. See [`dictionary-api.md`](dictionary-api.md), Check it.

## Dictionary API deploy

`.github/workflows/dictionary-api-deploy.yml` ships the service's Docker image
(`apps/dictionary-api/Dockerfile`, ADR 0009). It runs on a push to `main` that changes what the
image holds: the service, the core, what the services share, the package files it installs from
(the root ones and `apps/web/package.json`), the app's files it copies (the `.sqlite3` files, the
`Kanji*ReferenceData.json` files, the pack catalog, and Kuromoji's), and
`language-data/release.json`, the release the app routes name. Tests and the service's
conformance code (`apps/dictionary-api/src/conformance/`) aren't in the image, so they don't start
it. A pull request that
changes the same files runs only the `image` job, which builds and checks without pushing; a new
push cancels its last run. Other runs go one at a time, and a running one is never cancelled. By
hand, the `tag` input deploys an image already pushed (`sha-<commit>`) without building, to roll
back, but only to an image main signed before.

- **`image`** builds the image, with Docker's layer cache in the Actions cache, or pulls the one
  `tag` names, and starts it. It checks that `/v1/info` refuses a request without the token, that a
  search, its examples, a word, and a kanji (見る, JMdict entry 1259290, and 見) answer with it,
  and, for a build, that `/healthz` names this commit's release (the first 12 characters of its
  SHA). A build is then pushed as `:sha-<release>`, and as `:main` from `main` only.
- **`staging`** signs the image's digest with cosign, keylessly, then moves the `:staging` tag to
  it. Its `id-token: write` permission gives cosign a certificate for the run's
  GitHub identity, which names this workflow and the branch it ran from; since the `staging`
  environment only accepts `main`, that identity is always
  `.github/workflows/dictionary-api-deploy.yml@refs/heads/main`, the one the server's deployer
  requires. It signs before moving the tag, so the tag never names an image the deployer would
  refuse. On a rollback, it first checks that main signed the image, so an image a branch pushed
  can't be promoted. cosign's version is the one the server verifies with.
- **`production`** moves the `:production` tag to the image once `staging` has signed and tagged
  it, and not while `DEPLOY_PRODUCTION` is `false` unless run by hand, as for `Web deploy`.

Nothing here reaches the server. Its deployer (`deploy/deployer.sh`, run by cron every 5 minutes;
[`api-servers.md`](api-servers.md)) sees a tag move and swaps the image in, keeping the old one if the new one
doesn't come up, within 5 minutes of the tag moving. The workflow doesn't wait for that: Bot
Fight Mode on the zone challenges CI runners asking the service, and the website's Worker when a
runner sets it off, so nothing in CI can see which build runs. The server's journal says, and
#542 tracks alerts for it. With `DEPLOY_PRODUCTION` set to `false`, nothing moves `:production`
before a person has checked staging. The jobs that push or move tags have `packages: write`. The
image's reference reaches each step's shell through `env:`, never inside `run:`, since a
rollback's comes from an image the run pulled. The whole deploy is in
[`dictionary-api.md`](dictionary-api.md), How a deploy works.

## Account API

`.github/workflows/account-api.yml` checks the account service on pull requests that change it,
what the services share (`packages/node-service/`), its API reference (`docs/api/account-api.md`,
which its tests write), or what the website's account pages are built from (`apps/web/src/`, the
browser test against the service with `apps/web/e2e/test.ts` and `apps/web/playwright.config.ts`,
and the site's `next.config.ts`, `package.json`, and `wrangler.jsonc`), and by hand. A new push
cancels the pull
request's last run. The deployer and the backups script (`deploy/deployer.sh`,
`apps/account-api/deploy/backups.sh`) are ShellChecked by `Repository`'s `pnpm verify`.

- **`check`** runs `pnpm check` for `packages/node-service`, then for `apps/account-api`, with a
  Postgres 18 service container. `ACCOUNT_API_TEST_DATABASE_URL` points the service's database
  tests at it, so the migrations and the `pg` driver run against the Postgres the server runs,
  including two migrations started at once. The container trusts any connection and lives only as
  long as the job, so it has no password. See [`account-api.md`](account-api.md), Check it.
- **`website`** starts the service from its source on a Postgres 18 container, with the dev
  mailbox and the website's local origin, then runs the website's browser test against it
  (`apps/web/e2e/account-service.spec.ts`, on `next dev`, at the desktop width): a learner
  registers with an emailed code, edits the profile, signs out, signs in again, and deletes the
  account after a fresh sign-in ([`web.md`](web.md), Account pages). The `Web` workflow can't run
  it, with no service, so it runs here, as `Dictionary API` runs the website's rendered-page gate
  against the service it builds. It doesn't retry a failed run, as the `Web` workflow does: the
  service sends five codes from one address in 10 minutes, and a run sends three.
  `ACCOUNT_API_SECRET` is a CI-only value. On a failure it prints
  the service's log and keeps the test's trace, video, and screenshot as `account-pages-report`
  for a week.

## Account API deploy

`.github/workflows/account-api-deploy.yml` ships the account service's Docker image
(`apps/account-api/Dockerfile`, ADR 0013) as `Dictionary API deploy` ships the dictionary
service's, with the same three jobs, the same signing, the same `staging` and `production`
environments, and the same rollback by `tag`. It runs on a push to `main` that changes what the
image holds: the service, what the services share, and the package files it installs from (the
root ones). Tests and the backups script
(`apps/account-api/deploy/`) aren't in the image, so they don't start it.

Its `image` job starts the image beside a Postgres 18 service container, on the runner's network,
with a read-only file system as the server runs it. It checks that the image migrates the empty
database, that `/healthz` names this commit's release, that `/v1/health` answers
`{"status":"ok"}`, and that `/v1/auth/jwks` publishes a signing key. The image runs with CI-only
values for its required settings (`ACCOUNT_API_URL`, `ACCOUNT_API_SECRET`), and no sign-in
method on. The `staging` job signs with this workflow's identity,
`.github/workflows/account-api-deploy.yml@refs/heads/main`, which the deployer requires of the
account service's images. The first push creates the image's package in the organization,
private ([`api-servers.md`](api-servers.md), Set up the server). Until the server is set up for
the account service, the deployer skips it, so the tags move and nothing runs. The whole deploy is
in [`account-api.md`](account-api.md), How a deploy works.

## iOS

`.github/workflows/ios.yml` checks the iOS app on pull requests that change `apps/ios`, in two
jobs:

- `contracts` runs the data tools' contract tests (`apps/ios/Tools/tests/`) on Linux, with every
  Git LFS file under `apps/ios` but the archived source snapshots (`LFS_SNAPSHOTS`), which only a
  rebuild reads, and the recorded-audio check's recordings (`LFS_RECORDINGS`): they check the bundled packs and indexes against their pinned sources, import
  reports, and the bundled dictionary, and that each import report records the current hash of
  the tool that wrote it ([`ios.md`](ios.md)). It also checks that Release builds name no account
  service yet ([`ios.md`](ios.md), Opening sign-in in the App Store build). Its LFS cache is keyed
  on the pointers of the LFS patterns it fetches.
- `swift` runs `SearchExperienceTests` and `TranslatorCoreTests` with `xcodebuild` on the first iPhone Simulator of the
  newest iOS runtime, then the recorded-audio check's scoring tests with `swift test` (the replay
  itself needs the Mac's speech models, which the runner doesn't have, so it stays a local check,
  [`translate.md`](translate.md)), on `macos-26` (Xcode 26, for the iOS 26 SDK the package needs; arm64, which
  the `sudachi-swift` binary needs). A macOS minute costs about ten times a Linux one, so it runs
  only when the repository variable `IOS_SWIFT_TESTS` is `on`, or when the workflow is run by
  hand. Turning it on is the owners' decision.

## Search parity

`.github/workflows/search-parity.yml` keeps two implementations in step. Search retrieval, the
results screen, word pages' examples, and parts of the word page's detail (the per-kanji furigana
highlight, the pitch graph, Frequency Details, and the conjugation table) exist twice until issue 481 makes TypeScript
the single core (ADR 0008): Swift for the iOS app, and a TypeScript port for the website.

It runs on a pull request that changes a file of any pair below, and again when a label is added
or removed. It fails when one side of a pair changed without the other, and lists the changed
files. Change both, re-recording the conformance suite ([`dictionary-core.md`](dictionary-core.md),
Rules), or add the `search-parity-reviewed` label, which says the change applies to one side only
and skips the check.

| Pair | Swift sources (`<name>.swift` in `apps/ios/Modules/Sources/SearchExperience/`) | TypeScript ports |
| --- | --- | --- |
| search | `LookupClient`, `LookupDatabase`, `LookupEnglishRanking`, `LookupJapaneseRanking`, `LookupRankedEntries`, `SearchQuery`, `DictionaryRanking`, `JapaneseDeinflection`, `DictionaryEntry`, `JapaneseTextAnalysisClient` | Everything in `packages/dictionary-core/src/search/` |
| examples | `ExampleSentenceClient`, `ExampleSentenceDatabase`, `ExampleSentenceEntryRetrieval`, `ExampleSentenceModels`, `ExampleSentenceSearchRetrieval`, `JapaneseTextAnalysisClient`, `JapaneseInflectionGrouping`, `KuromojiMorphologyClient`, `LinkedJapaneseText` (the conjugated form's highlight) | The `.ts` files in `packages/dictionary-core/src/examples/`; `example-retrieval.ts`, `example-search.ts`, `word-examples.ts`, and `lookup.ts` in `packages/dictionary-core/src/artifact/`; `apps/dictionary-api/src/kuromoji.ts` |
| detail | `KanjiReadingSplitter`, `JapaneseRubyText` (the per-kanji furigana highlight), `WordDetailView`, `WordHeadline`, `WordDetailSections`, `PitchAccentBadge` (`PitchContourLayout`), `FrequencyDisclosure` (`FrequencyDisclosurePresentation`), `FrequencyPack`, `FrequencyPresentation`, `JapaneseConjugationClient`, `ConjugationsView` | `kanji-split.ts`, `pitch.ts`, `frequency.ts`, `conjugation.ts`, and `conjugation-table.ts` in `packages/dictionary-core/src/detail/` |
| results | `SearchResultsView`, `SearchResultsScreen` (the results screen's rows, titles, and counts), `SearchResultFrequencyOrdering` | The `.ts` files in `packages/dictionary-core/src/results/`, and `search-examples.ts` in `packages/dictionary-core/src/artifact/` |

Each pair is one `check` call in the workflow's script: the pair's name, a pattern for its Swift
files, a pattern for its TypeScript files, and where the port is, which the error names. To change
a pair, change the trigger's `paths`, the pair's patterns, and this table together.

## Language data build

`.github/workflows/language-data-build.yml` packages the next language-data release from the
committed files (issue 463, step 2). It runs on pull requests and pushes to `main` that change
`language-data/**`, the app's resources, `apps/ios/LanguageData/**`, the shared action, or the
workflow (and, on pull requests, the release workflow). Tests in `language-data/pipeline/tests/`
fail when a release input doesn't start it.

It packages through the shared action, then keeps only `manifest.json` and `files.tsv` (each staged
file's size and path) as the Actions artifact `language-data-manifest-<commit>`, for 7 days. It
has no credentials and publishes nothing. The files themselves (516 MiB) aren't kept:
`Language data release` rebuilds them rather than trusting this output. The job names
`shell: bash` so pipefail is on. See [`language-data/README.md`](../../language-data/README.md),
Running it.

## Language data release

`.github/workflows/language-data-release.yml` publishes the release `language-data/release.json`
names to the `zenbujapanese-language-data` R2 bucket (issue 463, step 3). It runs on a push to
`main` that changes any input of a release (the same inputs as the build, which the same tests
check), so changed content can't sit unpublished: it publishes, or fails until `release.json` is
bumped. It also runs by hand. One publish runs at a time, and none is cancelled halfway.

Its one job runs in the `language-data-release` environment, which deploys only from `main` and
has no required reviewer, by the owner's decision (add one in Settings → Environments to review
each release by hand). It:

1. checks that the environment has the R2 token's two secrets and the `CLOUDFLARE_ACCOUNT_ID`
   variable, before the 516 MiB build, so a missing one fails in seconds, by name;
2. rebuilds the release from this commit with the shared action;
3. publishes (`language-data/pipeline/publish.py`), then verifies: reads `releases.json` and the
   manifest back, and downloads and hashes every file. Both write to the job summary.

`AWS_REQUEST_CHECKSUM_CALCULATION` and `AWS_RESPONSE_CHECKSUM_VALIDATION` are `WHEN_REQUIRED` so
the AWS CLI sends only the checksum the publisher gives (SHA-256, in `object_store.py`), not its
default CRC trailers.
This is the only workflow with the bucket's token, so every action its job runs, the shared
action's included, is pinned by commit SHA (see Pinned actions). What a publish writes, and why
nothing published is overwritten, is in [`language-data/README.md`](../../language-data/README.md),
Publishing a release.

## The package-language-data action

`.github/actions/package-language-data/action.yml` is shared by both language-data workflows, and
needs a checkout. It:

1. sets up Python 3.12, installs `language-data/pipeline/requirements.txt` with
   `--require-hashes`, and runs the pipeline's tests;
2. lists the Git LFS files the release holds (`language-data/pipeline/package.py lfs-paths`),
   restores them from the cache, and pulls only those;
3. packages the release into its `out` input (`package.py build`), then validates the manifest and
   the staged files.

- The list is taken on its own line, so a failure stops the step, and checked not to be empty: an
  empty `--include` would pull every Git LFS file in the repository.
- The cache key hashes the files' pointers, which are in the checkout until the pull, so it's
  their oids. A restored object can't change a release: the build checks every file against its
  pointer's oid.
- Its steps name `shell: bash`, which runs with pipefail, so piping the build into `tee` doesn't
  hide a refusal.

## Pinned actions

The release job holds the bucket's token, and the image's jobs can push to the package and sign,
so the actions they run are pinned by commit SHA; elsewhere, actions are named by major-version
tag, such as `actions/checkout@v5`. To update a
pinned one, pin the new release's commit and change this table in the same pull request.

| Action | Commit | Version | Used in |
| --- | --- | --- | --- |
| `actions/checkout` | `fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09` | v5.1.0 | `.github/workflows/language-data-release.yml` |
| `actions/setup-python` | `ece7cb06caefa5fff74198d8649806c4678c61a1` | v6.3.0 | `.github/actions/package-language-data/action.yml` |
| `actions/cache` | `caa296126883cff596d87d8935842f9db880ef25` | v5.1.0 | `.github/actions/package-language-data/action.yml` |
| `docker/setup-buildx-action` | `f87e5991a6d7451dcb8d9637bfbc97413f497069` | v4.4.1 | `.github/workflows/dictionary-api-deploy.yml` |
| `docker/build-push-action` | `c3c9e263c25d99ce0380d002d59b67737d91b0dc` | v7.4.0 | `.github/workflows/dictionary-api-deploy.yml` |
| `docker/login-action` | `dbcb813823bdd20940b903addbd779551569679f` | v4.6.0 | `.github/workflows/dictionary-api-deploy.yml` |
| `sigstore/cosign-installer` | `6f9f17788090df1f26f669e9d70d6ae9567deba6` | v4.1.2, installing cosign v3.1.3 | `.github/workflows/dictionary-api-deploy.yml` |
