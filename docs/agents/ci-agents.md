# Claude's workflows

Three workflows run Claude in GitHub Actions: it reviews every pull request, answers `@claude`,
and gardens the docs and the code each week. Agents outside CI act as `serp-agent[bot]` (Outside
CI, below). Every workflow and what starts it is in [`ci.md`](ci.md). Change a workflow's section
in the same pull request as the workflow.

## Code review

`.github/workflows/code-review.yml` has Claude review every push to a pull request that isn't a
draft or opened by `claude[bot]`, `dependabot[bot]`, or `renovate[bot]`, with the repository's
`pr-review` skill
(`.claude/skills/pr-review/SKILL.md`): three reviewers in parallel (bugs; rules; and the issue,
tests, and docs) read the issue the pull request closes and every changed file. Each new finding
is an inline comment marked blocking or suggestion, and one summary comment, updated on every
review, says how many of the changed files were read. How it is built, why, and how to try a
change to it are in [`ci-review.md`](ci-review.md).

- **A thin review is labelled, never red.** A review that read part of the change is run once
  more. If it is still short, its summary comment starts with a line that says so
  (`**Incomplete: this review read 2 of 19 changed files and did not run its reviewers.**`), the
  run carries the same sentence as a warning, and the check passes: the owner chose a labelled
  thin review over a red check (2026-10-13). A second attempt that stopped before it finished
  says that first, in the same place.
- **The `review` check is red only when no review happened or its result was lost:** Claude's
  step failed or ended in an error, nothing was posted, findings were posted with no summary,
  GitHub refused the summary comment, or what the reviewer is given couldn't be built. A pull
  request closed or merged while the review ran gets a notice, not a red check. The `changes`
  check is never red: when it can't read the pull request's files it warns, and the review
  tries ([`ci-review.md`](ci-review.md), What turns the check red).
- **A pull request that changes the workflow is skipped, not failed.** The action runs only when
  the workflow file is the one on `main`, so `review` shows as skipped and `changes` leaves a
  notice that a person reviews the pull request. Such a change is tried with a local dry run
  first ([`ci-review.md`](ci-review.md), Trying a change to the review).
- **It doesn't block merging by itself,** since `main`'s ruleset requires no checks, but the
  ruleset does require every review conversation to be resolved, so an inline finding blocks
  merging until it's fixed or answered and resolved. A finding can be answered with an `@claude`
  request in its thread (@claude requests, below). Making merges wait for the check is a branch
  rule the owners decide.
- **An agent's pull request is reviewed.** Agents open pull requests and push as
  `serp-agent[bot]` (Outside CI, below), so the job names the bots it skips rather than skip every
  bot, and the action's `allowed_bots` lets `serp-agent[bot]` start Claude as well as
  `claude[bot]`, whose `@claude` fixes push to the pull request
  (`tools/checks/src/workflows.test.ts`, `code-review.test.ts`).

It runs with the `CLAUDE_CODE_OAUTH_TOKEN` repository secret, which is set; without it the job
only notes that it skipped (Claude's app and token, below).

## @claude requests

`.github/workflows/claude.yml` answers `@claude` in an issue, a pull request comment, a review,
or a review comment, from the repository's owners, members, and collaborators, and never from a
bot, so Claude's own comments can't start it again. That includes `serp-agent[bot]`: an `@claude`
an agent posts isn't answered, so a person asks. The repository is public, so the job checks
the commenter's association before it does anything: otherwise a stranger's `@claude` on their
own fork's pull request would check out and install that pull request with the job's tokens.
It also skips, with a notice, a pull request whose branch is in a fork, whoever asks: checking it
would run the fork's code with this repository's tokens, and Claude can't push to it. One run per
issue or pull request goes at a time, and a new one waits rather than cancelling it. The job, not
the workflow, holds that queue, so a comment that doesn't ask can't displace a waiting request.
GitHub keeps only one waiting run per queue, though: a third request while one runs and one
waits replaces the waiting one, so ask again after the first finishes.

- **Where it works.** On a pull request it checks out the pull request's head and may push fixes to
  its branch, which starts a re-review (Code review, above); on an issue it branches from `main` and
  links a pull request to open. It sets up pnpm and Node as `Repository` does and installs every
  package (`pnpm install --frozen-lockfile --ignore-scripts --ignore-pnpmfile`, so no install script
  or pnpmfile hook runs), since the edit hook needs the checks' dependencies and a fix may touch any
  package. The workflow's file is `main`'s while the checkout is the branch's, so on a branch from
  before `.node-version` it takes `main`'s copy, and keeps it out of what git sees there. The
  checkout keeps no token in the working tree (`persist-credentials: false`); the action sets up its
  own for pushing. It runs the pull request's own code when it checks it, so ask it only on a pull
  request whose code you trust.
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
[`quality.md`](../quality.md) and the two files it leads to whose Code changed after their Graded
date ("Scores to re-grade");
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
(`tools/checks/src/agents/maintenance-workflow.test.ts`). `claude[bot]` opens their pull
requests, so `Code review` and the `Pull request` checks skip them: skim each and merge it.

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

## Outside CI

An agent on a person's machine acts on GitHub as the organization's GitHub App, `serp-agent`,
which posts as `serp-agent[bot]`, never as a person: `gh` keeps one active account for every
session on the machine, and a person's account that GitHub hides takes everything it posted out
of everyone else's sight. SERP's
[Agent GitHub Identity](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/agent-harness/agent-github-identity.md)
standard says why, and its `serp-github-app` skill holds the scripts.

- **Each command that reaches GitHub names the bot** in the same shell command:
  `eval "$(bash ~/dev/repos/serp/skills/serp-github-app/scripts/env.sh)" && <command>`, for `gh`,
  `git push`, and a commit that will be pushed. It sets the app's token, and the bot as author and
  committer, for that shell only, so each new shell needs the line again.
- **Nothing changes the machine's sign-in:** never `gh auth switch`, `gh auth login`,
  `gh auth setup-git`, or `git config --global`.
- **When the line prints `false`,** the command after `&&` doesn't run: stop and tell the owner
  rather than fall back to a person's account.
- **Its pull requests get every check.** The `Pull request` jobs and Code review skip only
  `claude[bot]`, `dependabot[bot]`, and `renovate[bot]` (Code review, above, and
  [`ci.md`](ci.md), Pull request). An `@claude` it posts isn't answered (@claude requests, above).
- **What the app can't do stays with a person:** approving and merging (`AGENTS.md`), settings,
  and secrets.
