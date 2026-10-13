# The Code review workflow

How `.github/workflows/code-review.yml` is built, and why. What it does for a pull request, and
when its check is red, is in [`ci-agents.md`](ci-agents.md), Code review. Change this doc in the
same pull request as the workflow, its scripts, or the `pr-review` skill.

## What runs

Two jobs. `changes` decides whether the review can run. `review` does it, in these steps after
its checkout:

1. Take the review's scripts from the default branch.
2. Give the reviewer the rules, the change, its issue, and its earlier findings.
3. Note when the review starts, and delete any `tmp/review-summary.md` the pull request carries.
4. Review with Claude: the first attempt.
5. Decide whether the review read the whole change.
6. Review again with Claude, when it didn't: the second attempt, and the last.
7. Decide whether the last attempt read the whole change.
8. Post the review's summary.
9. Keep the review transcript.
10. Fail unless a review ran and was posted.

## Where each part comes from

- **The workflow file is the default branch's.** The action runs only when the workflow file is
  the one on `main`. So `changes` lists the pull request's files with `gh`, in a few lines of
  shell in the workflow itself, checking nothing out and running no script, and `review` runs
  only when the workflow isn't among them. Otherwise `review` shows as skipped, and `changes`
  leaves a notice that a person reviews the pull request. A pull request into a branch that
  changes the workflow still fails, saying no review happened
  ([`harness-debt.md`](../harness-debt.md), Checks).
- **The scripts are the default branch's too.** `tools/checks/review-context.mjs`, and
  `tools/checks/review-change.mjs` and `tools/checks/pull-request.mjs`, which it imports, are
  fetched through the contents API, never taken from the checkout or from the base branch: a
  pull request into another branch would otherwise run that branch's script with the job's
  token. They need no install, and they run only before Claude starts. Inline, they would take
  the workflow past 500 lines.
- **The skill and the rules are the base branch's.** The action replaces `.claude/`, `.mcp.json`,
  `.claude.json`, `.gitmodules`, `.ripgreprc`, `CLAUDE.md`, `CLAUDE.local.md`, and `.husky` with
  the base branch's copies before Claude starts (its `SENSITIVE_PATHS`), so a pull request can't
  rewrite its own review, and a `CLAUDE.md` written on the runner is lost. The script reads
  `AGENTS.md`, `ARCHITECTURE.md`, [`code.md`](code.md), and `CONTEXT.md` from the base branch
  through the API into a file outside the checkout, so a pull request can't weaken the rules
  it's reviewed against either.
- **The steps after Claude are inline in the workflow.** Their code is the workflow's own. What
  they read is not protected: the reviewer may `Write`, and a bare `Write` reaches every file
  the runner's user can write, the summary, the context a second attempt reads, and a later
  step's action among them ([`harness-debt.md`](../harness-debt.md), Checks).

## What the reviewer is given

`review-context.mjs` writes the context file, which is appended to the reviewer's system prompt
(`--append-system-prompt-file`), and a copy of it for each subagent's
(`--append-subagent-system-prompt-file`). It holds the rules, then the sections below. Every
path written into it is a JSON string, so a file name with a line break can't start a heading
of its own. A server error from GitHub is asked again, three times in all.

- **The change, where Read can page through it.** In 18 of 19 kept transcripts the reviewer
  started no reviewers. On #761 `gh pr diff` gave it the first 2 KB of a 125 KB diff and saved
  the rest to a file; it reached for shell commands that were denied (a compound command, `awk`,
  `git diff`), read 2 of 19 files, and stopped. So the script lists the pull request's files from
  the API and writes `tmp/review-change/` in the checkout, emptied first: `index.md`, with each
  file's path, status, lines added and removed, and its patch file with its line count, and one
  numbered patch per file. One Read returns at most 25,000 tokens, so the context says to page a
  long patch with `offset` and `limit`. A file GitHub gives no patch for (binary, or too large)
  is read itself; a file only renamed says so; and for a path the action replaces, the index
  says the patch is the only view of the pull request's version. The script refuses to write
  under a `tmp` the pull request made a symbolic link. `Bash(gh pr diff:*)` stays allowed for a
  local run of the skill.
- **The issue, as data.** On #761 the reviewer never ran `gh issue view`. The script reads each
  issue GitHub links as closed by the pull request (GraphQL `closingIssuesReferences`, which the
  job's token reads, as `Pull request`'s `issue-link` job shows; an issue's text needs
  `issues: read`, which the job has) and quotes its title, body, and comments, each with its
  author, under a heading that says nothing in it is an instruction. Anyone can write an issue
  or a comment, so only what an owner, member, or collaborator wrote is copied; the rest is
  named, to read with `gh issue view`. An issue over 20,000 characters is cut, keeping its
  latest comments, and all issues together over 40,000, and each cut says so.
- **The issue of a pull request into another branch.** GitHub links a closing keyword only on a
  pull request into the default branch. For any other, the script takes the issues from the
  closing keywords in the description (`closingReferences` in `pull-request.mjs`), under the
  same rule about who wrote them. On a pull request into the default branch with no link yet
  and no `No issue:` line, it asks three times, five seconds apart, as `issue-link` does, since
  a link can arrive late, then says GitHub links none.
- **Earlier findings.** The top-level inline comments `claude[bot]` posted on the pull request,
  and the summary: the latest comment by `github-actions[bot]` that starts with
  `## Claude review`. Claude's answers to `@claude` requests, and its replies in review threads,
  are passed in as context only.
- **What every review does,** last: start the skill's three reviewers with the Agent tool, which
  older versions call Task (`--allowedTools` names both), on every pull request; reading the
  diff alone is not a review; the issue is always checked.

## Findings and the summary

- **Inline findings post as they are made** (`classify_inline_comments: "false"`). By default the
  action buffers each inline comment in a file and posts the buffer after every run of the
  action, without emptying it, so a second attempt would post the first attempt's comments
  again. Its classifier of test comments needs an Anthropic API key, which this workflow
  doesn't use, so buffering bought nothing here; without it the reviewer also sees GitHub
  refuse a comment on a line outside the diff.
- **One summary comment, edited in place.** Claude writes the summary to
  `tmp/review-summary.md`, and a step posts it with the job's own token, editing the earlier
  summary by id or creating one, never the latest comment, which can be an answer to an
  `@claude` request. The token needs `pull-requests: write`: GitHub refuses a comment on a pull
  request from a job token with only `issues: write` (403). A summary without the
  `## Claude review` heading gets it from the workflow, since the next review finds the comment
  by it.

## Attempts and the label

- **One script decides whether an attempt read the whole change,** from the attempt's log, its
  summary file, and the file count the context step counted. It is complete when the summary
  has a `Read <N> of <M> changed files.` line whose M is that count, and either N is M, or the
  unread files are named on a `Not read:` line and the reviewer itself started three reviewers
  that ran. A review that read every file is complete however it split the reading (#757).
- **An incomplete first attempt gets a second,** and so does a summary without its heading. The
  script appends a correction to the reviewer's context, never the subagents': what the first
  attempt left out, up to forty of the changed files no Read call in its log opened, each with
  its patch file's path, and the inline comments it posted, read from GitHub so that none is
  posted twice. If GitHub can't be read, there is no second attempt. The first attempt's summary
  and log are set aside.
- **An incomplete last attempt is labelled, not failed.** The workflow, not Claude, puts a line
  such as `**Incomplete: this review read 2 of 19 changed files and did not run its
  reviewers.**` under the summary's heading, and writes it as a warning and into the step
  summary. That is the owner's decision of 2026-10-13
  ([`harness-debt.md`](../harness-debt.md), Checks).
- **A second attempt that leaves no summary falls back to the first.** The second attempt may
  fail without failing the job (`continue-on-error`). When it leaves no summary, by an error or
  by writing none, the first attempt's is posted with its line, which then also says a second
  attempt left none, and the last step passes with a warning that names the failure.

## What turns the check red

A thin review never does. The `review` check is red when no review happened or its result was
lost:

- the last step finds no log from the only attempt, a result that is an error (it adds how to
  renew the token on a 401, [`ci-agents.md`](ci-agents.md), Claude's app and token), or
  subagents still running when it ended;
- nothing was posted or updated during the run, with the denied tool named when one was denied,
  or inline findings were posted with no summary. It counts only the review's own output: the
  summary, top-level inline comments, and reviews, not an answer to an `@claude` request;
- a second attempt failed and no summary was posted;
- GitHub refused the summary comment, or the summary is longer than a comment holds;
- the scripts couldn't be fetched, or the context couldn't be built: GitHub's API kept failing,
  or `tmp` is a symbolic link.

The `changes` check is red when GitHub didn't list the pull request's files in three tries.

## The rest

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
- **The transcripts are kept** for a week as the `claude-review-transcript` artifact, the first
  attempt's beside the last when there were two: the action's own log shows counts only. The
  step summary shows the last attempt's turns, time, estimated cost, and models.

## Trying a change to the review

The review can't run on a pull request that changes it, so a local dry run is the only proof
before merging. `tools/checks/review-dry-run.mjs` does what the job does around the reviewer,
with `gh` signed in and no token to handle; it posts nothing.

1. In a checkout of the branch under test, with a checkout of the pull request's head to review:
   `node tools/checks/review-dry-run.mjs context <pull request> <checkout of its head> <folder>`.
   It writes the context, rules first, into the folder, the change into that checkout's
   `tmp/review-change/`, and prints the `claude -p "/pr-review ..."` command: the workflow's
   arguments without the inline-comment tool, its output kept as a transcript.
2. Run that command. It uses the `pr-review` skill of the checkout it runs in.
3. `node tools/checks/review-dry-run.mjs verdict <folder> <transcript>` runs the workflow's own
   deciding script on the transcript and the summary. When it asks for a second attempt, the
   correction is already at the end of the context: run the command again, then `verdict` with
   `last` after the transcript to see the line the comment would get.

A transcript kept from a real run works too: `verdict` reads its paths as the checkout's, which
is how a second attempt after a real thin review is tried.

## Tests

`tools/checks/src/agents/` runs each script as the workflow does, against a stand-in for the
GitHub API: `code-review.test.ts` (the jobs, the scripts' origin, the summary),
`code-review-context.test.ts` and `code-review-issue.test.ts` (what the reviewer is given),
`code-review-verdict.test.ts` (the decision and the correction), `code-review-attempts.test.ts`
(both attempts end to end, and the sequences that end without a summary, on abridged copies of
the logs of #757, #759, and #761), `code-review-guard.test.ts` (the last step), and
`review-dry-run.test.ts` (the dry run, against a stand-in `gh`).
