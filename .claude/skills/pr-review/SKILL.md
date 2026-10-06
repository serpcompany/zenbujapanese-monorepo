---
name: pr-review
description: Review a pull request for real bugs and for breaches of this repository's rules (AGENTS.md, ARCHITECTURE.md, docs/agents/code.md, and CONTEXT.md), post each new finding as an inline comment, and keep one summary comment up to date. Re-reviews after every push without repeating earlier findings. The Code review workflow runs it on every pull request; run it locally with /pr-review <owner>/<repo>/pull/<number>.
allowed-tools: Bash(gh pr view:*), Bash(gh pr diff:*), Bash(gh pr comment:*), Bash(gh api --method PATCH repos/*/issues/comments/* -F body=@tmp/review-summary.md), Write, mcp__github_inline_comment__create_inline_comment, Task, Read, Glob, Grep
---

# Review a pull request

The argument names the pull request: `<owner>/<repo>/pull/<number>` ($ARGUMENTS). Pass
`--repo <owner>/<repo>` to every `gh` command.

## 1. Check that it needs a review

Run `gh pr view <number> --repo <owner>/<repo> --json state,isDraft,title,body,headRefOid,baseRefName`.
Stop without posting anything if the pull request is closed or a draft.

## 2. Gather what the review needs

- **The change:** `gh pr diff <number> --repo <owner>/<repo>`.
- **The rules:** `AGENTS.md`, `ARCHITECTURE.md`, `docs/agents/code.md`, and `CONTEXT.md`, as
  they are on the base branch. In CI they are already in your instructions; otherwise read
  them from the base branch.
- **Earlier findings:** in CI, your instructions list what Claude already posted on this pull
  request (file, line, and text) and name your summary comment. Otherwise read them with
  `gh pr view <number> --repo <owner>/<repo> --comments`. Claude's replies to `@claude` requests
  aren't findings: they're context, and you never edit them.
- **The code around the change:** read what a changed line depends on (callers, types, tests,
  and the doc `AGENTS.md` routes the area to) with Read, Grep, and Glob. The diff alone often
  hides the bug.

## 3. Review in parallel

Start these three reviewers with the Task tool in one message, so they run together. Give each
the diff, the pull request's title and description, and the earlier findings:

1. **Bugs:** logic errors, missed edge cases, security holes (the service's token, secrets, what
   a log line records), data loss, races, and error handling that hides failures, in what this
   pull request adds or changes. For the dictionary, a result that differs from the app's
   (the Swift the core ports) is a bug.
2. **Rules:** every rule in the files above that the change breaks, with the rule quoted: a
   layer imported the wrong way in spirit where no lint catches it, a response shape changed in
   a way an older site or service can't read, a term used against `CONTEXT.md`.
3. **Tests and docs:** a behavior change without its product doc and check in the same pull
   request (`AGENTS.md`), code the area's doc now describes wrongly, and known debt the change
   adds without a row in `docs/tech-debt.md`.

Skip what `pnpm check` already enforces: comments, file size, doc links, formatting, the lint
rules, types, and the tests. Each reviewer returns its findings as: file, line in the new
version, what is wrong, why it matters (quoting the rule when one applies), the fix, and its
confidence (high, medium, low).

## 4. Keep only what is real and new

Check every finding yourself against the code at the head commit:

- Drop anything low-confidence, speculative, stylistic, already there before this pull request,
  or caught by the checks.
- Drop anything that repeats an earlier finding: the same problem at the same place, or at the
  lines it moved to, however it is worded.
- Keep what a careful senior reviewer would ask to fix before merging.

## 5. Post

- **Each kept finding:** one inline comment with
  `mcp__github_inline_comment__create_inline_comment` on the line it concerns: a bold one-line
  title, what is wrong and why, the rule quoted when one applies, and the fix. Link a rule with
  a full URL to the base branch's copy,
  `https://github.com/<owner>/<repo>/blob/<baseRefName>/<path>`, since relative links don't
  resolve from a pull request comment.
- **Then the summary**, one comment that each review updates in place. Write it to
  `tmp/review-summary.md` (gitignored), then update the comment with
  `gh api --method PATCH repos/<owner>/<repo>/issues/comments/<id> -F body=@tmp/review-summary.md`,
  or, when the pull request has none yet, create it with
  `gh pr comment <number> --repo <owner>/<repo> --body-file tmp/review-summary.md`. The body stays
  in the file so no permission rule reads the summary's words as a command. In CI your instructions give
  the id, or say there's none; locally, it's your comment that starts with `## Claude review` in
  `gh api repos/<owner>/<repo>/issues/<number>/comments`. Never use `gh pr comment --edit-last`:
  Claude's latest comment can be its reply to an `@claude` request. The summary starts with
  `## Claude review`, which is how the next review finds it, and reads:
  - `## Claude review` and `Reviewed <short head commit>.`
  - `<N> new finding(s), commented inline.` or `No new findings.`
  - When there are earlier findings: one line each saying whether this commit fixes it or it
    still applies, linking to its comment.

Never post a finding twice, and never add a second summary comment.
