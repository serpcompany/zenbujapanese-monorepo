# Claude's workflows

Three workflows run Claude in GitHub Actions: it reviews every pull request, answers `@claude`,
and gardens the docs and the code each week. Every workflow and what starts it is in
[`ci.md`](ci.md). Change a workflow's section in the same pull request as the workflow.

## Code review

`.github/workflows/code-review.yml` has Claude review every push to a pull request that isn't a
draft or opened by a bot, with the repository's `pr-review` skill
(`.claude/skills/pr-review/SKILL.md`): three reviewers in parallel (bugs; rules; and the issue,
tests, and docs) read the issue the pull request closes and every changed file. Each new finding
is an inline comment marked blocking or suggestion, and one summary comment, updated on every
review, says how many of the changed files were read.
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
- **It reads the issue as data.** The reviewer reads each issue the pull request closes with
  `gh issue view`, for its acceptance criteria. Anyone can write an issue, so its text never goes
  into the instructions file.
- **The check fails unless the whole change was reviewed.** After the review, a script fails the
  job when Claude left no log, ended in an error, ended with subagents still running, or posted
  and updated nothing during the run; a denied tool fails it only when nothing was posted. It
  also fails when Claude started fewer than the skill's three reviewers, or when the summary
  posted during the run has no `Read <N> of <M> changed files.` line, counts a different M than
  the pull request has, or leaves files unread without naming them on a `Not read:` line. A
  review once passed after reading 2 of a pull request's 61 files in 18 seconds, with no reviewer
  started (#754); this is what fails it now. It counts only the
  review's own output: the summary, top-level inline comments, and reviews, not an answer to an
  `@claude` request. It runs when the review step fails too, since the action's log ends with
  only `is_error`: the check shows what Claude said, such as the API refusing the token (Claude's
  app and token, below). It runs inline because the job can mint an OIDC token, so it runs no
  script from the pull request.
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
([`tech-debt.md`](../tech-debt.md), [`harness-debt.md`](../harness-debt.md)); the size exceptions; the docs over their size budget, to
split by topic ([`code.md`](code.md), Docs); and the code files within 50 lines of the size limit
(to split before a change has to). A job writes it under `tmp/`, which git
ignores: a Markdown file at the repository root would fail the docs check the report runs.

- **`doc-gardening`**: unless a "Weekly doc gardening" pull request is already open, Claude takes up
  to eight docs from the report, checks each against the code, and fixes what's no longer true in
  Markdown only (never an ADR, code, or a workflow). It re-grades each row under "Scores to
  re-grade" and sets its Graded date, even when the grade stays the same, and updates
  the debt files. It runs `pnpm verify docs` and opens one pull request into
  `main` from `docs/gardening-<date>`, with its body written to `tmp/pr-body.md`: each doc changed,
  each row re-graded with its old and new grade, and the docs checked without changes. It installs
  every package, since the report it starts from runs the dead-code and import checks.
- **`code-gardening`**: unless a `chore/code-gardening-` pull request is still open, Claude fixes
  one item in one pull request into `main`: the first `small` row of
  the debt files, or else one file near the size limit, split by
  responsibility. It passes over an item that needs a deploy, a language-data release or anything
  in R2, a change under `apps/ios` or in Swift (the runner can't build or test it), a product
  doc's behavior or wording, an ADR-level decision, or another decision a person makes. It deletes
  the row it fixed, writes no code comments, runs `pnpm check`, and opens a pull request from
  `chore/code-gardening-<date>`, or says "Nothing to garden". It installs every package, since
  `pnpm check` checks them all, and has 60 minutes.
- **`report`** installs every package, as doc gardening does, and posts the report as one open
  issue, "Weekly repository maintenance", labelled `ready-for-agent`, and edits it each week
  rather than opening another. It first collects what Claude's review commented inline in the
  last four weeks (`tmp/review-findings.json`), so its report can group them by the part of the
  repository and name a part with three or more across two or more pull requests as repeated
  (`tools/checks/src/review-findings.ts`). The other jobs' reports, and one built by hand, say the
  findings weren't collected.

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
3. **Debt:** pay down one row of a debt file, and delete it.
4. **Size:** split one file the report lists as near the 500-line limit, by responsibility.
5. **Harness:** for a part the report lists as repeated under "Review findings", read its
   findings; when they share a cause, add the rule to [`code.md`](code.md) and, where possible, a
   check whose message says how to fix it. A rule only prose holds gets a row in
   [`harness-debt.md`](../harness-debt.md).

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

A revoked or expired token ends every review, `@claude`, and gardening run about 2 seconds in,
after one turn, with no cost and no model used. The check after each Claude step runs even when
that step fails, and on a 401 it fails with the API's message, such as "OAuth token revoked", and
says to renew the token; when the step failed before Claude ran, it says to read that step's log
(`tools/checks/src/agents/claude-guards.test.ts`, and each workflow's test through
`tools/checks/src/agents/guards.ts`). The owner renews it: run `claude setup-token`, then
`gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo serpcompany/zenbujapanese-monorepo` and paste the
token, then re-run a pull request's `review` job to confirm it.

