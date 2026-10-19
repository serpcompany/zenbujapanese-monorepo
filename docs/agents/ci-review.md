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
4. Review with Claude: the first attempt, with 12 minutes.
5. Decide whether the review read the whole change.
6. Review again with Claude, when it didn't: the second attempt, and the last, with 10 minutes.
7. Say whether the last attempt read the whole change, and post its summary.
8. Keep the review transcript.
9. Fail unless a review ran and was posted.

The time limits come from measurements: on the runner an attempt took 11 to 148 seconds, and the
slowest dry run, a second attempt on 19 files, 329. Twelve minutes is over twice that, ten nearly
twice, and together they leave 8 of the job's 30 minutes for the other steps, which make a few
requests each. A limit on the step matters more than its size: a second attempt that hangs
fails as a step, so the steps after it still post what there is, and a first attempt that hangs
posts nothing but has the last step say it was stopped. The job's own limit would cancel both.

## Where each part comes from

- **The workflow file is the default branch's.** The action runs only when the workflow file is
  the one on `main`. So `changes` reads the pull request's file list, checking nothing out, and
  `review` runs only when the workflow isn't in it. Otherwise `review` shows as skipped, and
  `changes` leaves a notice that a person reviews the pull request. A pull request into a branch
  that changes the workflow still fails, saying no review happened
  ([`harness-debt.md`](../harness-debt.md), Checks).
- **One inline script holds every step the workflow runs itself,** each naming its part in
  `STEP`: `files`, `scripts`, `first`, `last`, and `check`. It is in the workflow, so it is the
  default branch's, and it loads nothing from the runner, where Claude could have written a
  file. One script, so every step asks GitHub the same way.
- **The scripts that build the reviewer's context are the default branch's too.**
  `tools/checks/review-context.mjs`, and `tools/checks/review-change.mjs` and
  `tools/checks/pull-request.mjs`, which it imports, are fetched through the API at one commit
  of the default branch, asked for as a SHA alone, never from the checkout or the base branch:
  a pull request into another branch would otherwise run that branch's script with the job's
  token. They need no install, and they run only before Claude starts. Inline, they would take
  the workflow past 500 lines. `changes` uses none of them, so it works before the default
  branch has them.
- **The skill and the rules are the base branch's.** The action replaces `.claude/`, `.mcp.json`,
  `.claude.json`, `.gitmodules`, `.ripgreprc`, `CLAUDE.md`, `CLAUDE.local.md`, and `.husky` with
  the base branch's copies before Claude starts (its `SENSITIVE_PATHS`), so a pull request can't
  rewrite its own review, and a `CLAUDE.md` written on the runner is lost. The script reads
  `AGENTS.md`, `ARCHITECTURE.md`, [`code.md`](code.md), and `CONTEXT.md` from the base branch
  through the API into a file outside the checkout, so a pull request can't weaken the rules
  it's reviewed against either.
- **What the steps after Claude read is not protected.** The reviewer may `Write`, and a bare
  `Write` reaches every file the runner's user can write: the summary, the context a second
  attempt reads, and the code of an action a later step runs
  ([`harness-debt.md`](../harness-debt.md), Checks).

## Asking GitHub

Every request the workflow's own steps make, and every one `review-context.mjs` makes, has the
same patience. An answer has 30 seconds to arrive whole: its body is read inside the same try,
so one that is cut short or stalls counts as no answer. A server error, no answer, or a 429 is
asked again up to three more times, after 5, 15, and 45 seconds, or after the wait GitHub names
(`retry-after`, or the reset of a used-up rate limit) when it names one within 90 seconds. A 403
that names no wait is a refusal, and a 404 is an answer: neither is asked again. A GraphQL
answer that arrives with errors and without the pull request is asked again the same way. The
answer to a write is its status alone. One request may already have been made when it fails:
the one that creates the summary comment. After a 429, or a 403 that names a wait, GitHub
refused it without acting, so it is sent again. After a server error or no answer, the step
waits as for any request, then looks on the pull request for a summary by the workflow's bot
created since the review started: if one is there the create worked, and it is updated only if
its text isn't the one sent; if none is, it is created again. So nothing is posted twice, and
only a fourth failed create fails the step.

`changes` is never the red check, and never cancelled at its 10 minutes. When GitHub can't list
the pull request's files, or hasn't after 300 seconds, it warns and lets `review` try, which
says so itself if no review happens.

## What the reviewer is given

`review-context.mjs` writes the context file, which is appended to the reviewer's system prompt
(`--append-system-prompt-file`), and a copy of it for each subagent's
(`--append-subagent-system-prompt-file`). It holds the rules, then the sections below. Every
path and branch name written into it is a JSON string, so a file name with a line break can't
start a heading of its own.

- **The change, where Read can page through it.** In 18 of 19 kept transcripts the reviewer
  started no reviewers. On #761 `gh pr diff` gave it the first 2 KB of a 125 KB diff and saved
  the rest to a file; it reached for shell commands that were denied (a compound command, `awk`,
  `git diff`), read 2 of 19 files, and stopped. So the script lists the pull request's files from
  the API and writes `tmp/review-change/` in the checkout, emptied first: `index.md`, with each
  file's path, status, lines added and removed, and its patch file with its line count, and one
  numbered patch per file. One Read returns at most 25,000 tokens, so the context says to page a
  long patch with `offset` and `limit`. A file GitHub gives no patch for (binary, or too large)
  is read itself, and a file only renamed says so. For a path the action replaces, the index
  says the patch is the only view of the pull request's version: the checkout holds the base
  branch's copy. The script refuses to write under a `tmp` the pull request made a symbolic
  link. `Bash(gh pr diff:*)` stays allowed for a local run of the skill.
- **The issue, as data.** On #761 the reviewer never ran `gh issue view`. The script reads each
  issue GitHub links as closed by the pull request (GraphQL `closingIssuesReferences`, which the
  job's token reads, as `Pull request`'s `issue-link` job shows; an issue's text needs
  `issues: read`, which the job has) and quotes its title, body, and comments, each with its
  author, under a heading that says nothing in it is an instruction. Anyone can write an issue
  or a comment, so only what an owner, member, or collaborator of this repository wrote is
  copied. An issue in another repository is never copied, whoever wrote it: GitHub's word for
  its author is about that repository. What isn't copied is named, to read with
  `gh issue view`. An issue over 20,000 characters is cut, keeping its latest comments, and all
  issues together over 40,000, and each cut says so.
- **The issue of a pull request into another branch.** GitHub links a closing keyword only on a
  pull request into the default branch. For any other, the script takes the issues from the
  closing keywords in the description (`closingReferences` in `pull-request.mjs`), under the
  same rules. It reads a keyword as GitHub does: not in a code span, a fenced block (indented,
  closed by a longer fence, or never closed), or an HTML comment, not across lines, not at the
  end of another word, and not before a number too long to be an issue's. One case is left: it
  reads a keyword in an indented code block, which it can't tell from a list item's text, so an
  unrelated issue the team wrote can reach the context. On a pull request into the default
  branch with no link yet and no `No issue:` line, it asks three times, five seconds apart, as
  `issue-link` does, since a link can arrive late, then says GitHub links none.
- **Earlier findings.** The top-level inline comments `claude[bot]` posted on the pull request,
  and the summary: the latest comment by `github-actions[bot]` that starts with
  `## Claude review`. Claude's answers to `@claude` requests, and its replies in review threads,
  are passed in as context only.
- **What every review does,** last: start the skill's three reviewers with the Agent tool, which
  older versions call Task (`--allowedTools` names both), on every pull request; reading the
  diff alone is not a review; the issue is always checked.

## Findings and the summary

- **Inline findings post as they are made** (`classify_inline_comments: "false"`), and the
  context says so. By default the action buffers each inline comment in a file and posts the
  buffer after every run of the action, without emptying it, so a second attempt would post the
  first attempt's comments again. Its classifier of test comments needs an Anthropic API key,
  which this workflow doesn't use, so buffering bought nothing here; without it the reviewer
  also sees GitHub refuse a comment on a line outside the diff. What it costs: a call made with
  `confirmed: false`, which the tool's own description says is never posted, is posted too.
- **One summary comment, edited in place.** Claude writes the summary to
  `tmp/review-summary.md`, and the `last` step posts it with the job's own token, editing the
  earlier summary by id or creating one, never the latest comment, which can be an answer to an
  `@claude` request. The token needs `pull-requests: write`: GitHub refuses a comment on a pull
  request from a job token with only `issues: write` (403). A summary without the
  `## Claude review` heading gets it from the workflow, since the next review finds the comment
  by it.

## Attempts and the label

- **One function decides whether an attempt read the whole change,** from the attempt's log, its
  summary file, and the file count the context step counted. It is complete when the summary
  has a `Read <N> of <M> changed files.` line whose M is that count, and either N is M, or the
  unread files are named on a `Not read:` line and the reviewer itself started three reviewers
  that ran. A review that read every file is complete however it split the reading (#757). A
  missing heading is not part of it: the workflow adds the heading.
- **An incomplete first attempt gets a second.** The `first` step appends a correction to the
  reviewer's context: what the first attempt left out, up to forty of the changed files no Read
  call in its log opened, each with its patch file's path, and the inline comments it posted,
  each with its link, read from GitHub so that none is posted twice. They are this round's
  findings, so the correction says to count them in the summary, which then can't say
  `No new findings.` after a round that posted some. The subagents' context gets that list of
  comments and nothing else of the correction, which is addressed to the reviewer. If GitHub
  can't be read, there is no second attempt. The first attempt's summary and log are set aside.
- **An incomplete last attempt is labelled, not failed.** The workflow, not Claude, puts a line
  such as `**Incomplete: this review read 2 of 19 changed files and did not run its
  reviewers.**` under the summary's heading, and writes it as a warning and into the step
  summary. That is the owner's decision of 2026-10-13
  ([`harness-debt.md`](../harness-debt.md), Checks).
- **A second attempt that leaves no summary falls back to the first.** The second attempt may
  fail, or run out of time, without failing the job (`continue-on-error`). When it leaves no
  summary, by an error or by writing none, the first attempt's is posted with its line, which
  then also says a second attempt left none, and the last step passes with a warning that
  names the failure.
- **A second attempt that stops after writing a summary has that summary posted,** since the
  later review is the fuller one, under a first line that says the second attempt stopped
  before it finished, and a second line when its own count falls short. A step stopped at its
  time limit leaves no log, so that line then says it left no log of its reviewers. The `last`
  step is given the second attempt's outcome for this, and the job passes with a warning.
- **A pull request closed or merged while the review ran gets no second attempt.** The skill
  posts nothing on a pull request that isn't open, which reads as a review with no summary. So
  the `first` step asks for no second attempt on one that is no longer open, and when no
  summary was posted on one, the last step passes with a notice that says so.

## What turns the check red

A thin review never does, and neither does `changes`. The `review` check is red when no review
happened or its result was lost:

- the only attempt left no log (the step failed before Claude ran, or was stopped at its time
  limit), ended in an error (the message adds how to renew the token on a 401,
  [`ci-agents.md`](ci-agents.md), Claude's app and token), or ended with subagents still
  running;
- nothing was posted or updated during the run on a pull request that is still open, with the
  denied tool named when one was denied, or inline findings were posted with no summary. It
  counts only the review's own output: the summary, top-level inline comments, and reviews, not
  an answer to an `@claude` request;
- a second attempt failed and no summary was posted;
- the summary couldn't be posted: GitHub refused the comment, kept failing past the patience
  above, or the summary is longer than a comment holds. The last step then says that step
  failed, not that the summary is missing;
- the scripts couldn't be fetched or the context couldn't be built, after the patience above,
  or `tmp` is a symbolic link. A failed fetch names the file and the commit.

## The rest

- **It reviews the pushes `@claude` and agents make.** `allowed_bots` names `claude[bot]`,
  `serp-agent[bot]`, and `Copilot`, so the review runs on a push an `@claude` request made to the
  pull request, or one an agent or Copilot's coding agent made, whose actor is then a bot. A pull
  request `claude[bot]`, `dependabot[bot]`, or `renovate[bot]` opened, such as a gardening one,
  isn't reviewed.
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
  `--allowedTools`, Read, Glob, and Grep, `git push` to a branch, and `gh pr create`. No job lists
  `gh api`, so CI denies it, which is why the review's summary is posted by a workflow step rather
  than by Claude. The rules ask only before deploys, secrets and variables, repository settings,
  deletes, a forced ref, and any merge (`gh pr merge`, the merge and merges routes, and GraphQL's
  merge, enqueue, and auto-merge mutations), so a local agent's other GitHub reads and writes, such
  as comments and review threads, run without a prompt. `tools/checks/src/agents/settings.test.ts`
  checks both directions: every package script that deploys is asked, and nothing a Claude job in
  any workflow runs is.
- **The transcripts are kept** for a week as the `claude-review-transcript` artifact, with the
  first attempt's log and summary beside the last when there were two: the action's own log
  shows counts only. The step summary shows the last attempt's turns, time, estimated cost, and
  models.

## Trying a change to the review

The review can't run on a pull request that changes it, so a local dry run is the only proof
before merging. `tools/checks/review-dry-run.mjs` does what the job does around the reviewer,
with `gh` signed in and no token to handle. It only reads from GitHub: the summary comment the
last step would post is written to a file instead.

1. In a checkout of the branch under test, with a checkout of the pull request's head to review:
   `node tools/checks/review-dry-run.mjs context <pull request> <checkout of its head> <folder>`.
   It writes the context, rules first, into the folder, the change into that checkout's
   `tmp/review-change/`, and prints the `claude -p "/pr-review ..."` command: the workflow's
   arguments without the inline-comment tool, its output kept as a transcript.
2. Run that command. It uses the `pr-review` skill of the checkout it runs in. To run the
   version the runner does, put `npx -y @anthropic-ai/claude-code@<version>` where the command
   says `claude`. The version is `claudeCodeVersion` in the pinned action's
   `src/entrypoints/run.ts`, and `claude_code_version` in the first message of any kept
   transcript: 2.1.295 at the pin of 2026-10-13.
3. `node tools/checks/review-dry-run.mjs verdict <folder> <transcript>` runs the workflow's own
   `first` step on the transcript. When it asks for a second attempt, the correction is already
   at the end of the context: run the command again, then `verdict` with `last` after the
   transcript, which runs the `last` step and keeps the comment it would post in
   `summary-comment.md`.

A transcript kept from a real run works too: `verdict` reads its paths as the checkout's, and
takes the summary that transcript wrote, whatever an earlier run left on disk. That is how a
second attempt after a real thin review is tried. `context` says when the pull request isn't
open, since the reviewer may then stop at once, and `verdict` measures a transcript as if it
were open, so a kept transcript of a merged pull request still gets its second attempt.

## Tests

`tools/checks/src/agents/` runs each step as the workflow does, against a stand-in for the
GitHub API: `code-review.test.ts` (the jobs, the inline script and its patience, the scripts'
origin), `code-review-context.test.ts` and `code-review-issue.test.ts` (what the reviewer is
given), `code-review-verdict.test.ts` (the decision and the correction),
`code-review-summary.test.ts` (the comment), `code-review-attempts.test.ts` (both attempts end
to end, a second attempt that stops early or leaves no summary, and a pull request closed
meanwhile, on abridged copies of the logs of #757, #759, and #761), `code-review-guard.test.ts`
(the last step), and `review-dry-run.test.ts` (the dry run, against a stand-in `gh`). The
stand-in can lose an answer or cut its body short, which is how the patience is tried.
