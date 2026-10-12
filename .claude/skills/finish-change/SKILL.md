---
name: finish-change
description: Take a change in this repository from "the code works" to "ready for a pull request", and clean up after it merges. Runs every check, drives a website change in the browser and an app change in the Simulator, has a fresh agent review the diff against the issue and the repository's rules, and a website change's pages against stock shadcn and the existing pages, brings the docs, quality grades, and debt lists in line, and drafts the pull request. Use before opening or updating a pull request, after answering review feedback, and after a merge.
---

# Finish a change

A change is done when `docs/agents/code.md` says it is. This is the loop that gets it there. Stop
and ask the person only when a step needs their judgment: a product decision, a rule that seems
wrong, or anything outward-facing (a push, a pull request, a comment).

## 1. Check it

Run `pnpm check` from the repository root, in the background, since it builds the site and runs
every package's tests. It is the finish gate: run it once on the finished tree, and cite that run
rather than repeat it while nothing has changed (`docs/agents/verification.md`). For a change to
`language-data`, also run the pipeline's tests (`language-data/README.md`). Fix what fails and run
what failed again; never loosen a check or add an exception to pass it. A rule that really can't be
met goes to the person, with why.

## 2. Show it working

- A website change: run `pnpm test:e2e` in `apps/web`, adding a browser test for what the change
  adds and a regression test for a bug it fixes (the `browser-tests` skill). Then use the
  `verify-web` skill, and keep what it showed (the pages, snapshots, and screenshots) for the pull
  request.
- A dictionary or account service change: run it as `docs/agents/dictionary-api.md` or
  `docs/agents/account-api.md` says, and call the routes the change touches.
- An app change: run the package tests it touches, and use the `verify-app` skill for its
  screens, on this checkout's own Simulators. Keep the run folder for the pull request. On a
  machine that can't build the app (`docs/agents/ios.md`), say so in the pull request rather than
  claiming it works.

## 3. Review the diff with fresh eyes

Start a subagent that has not seen the work, and give it only the issue the change closes,
`git diff main...HEAD` plus the uncommitted diff, `AGENTS.md`, `ARCHITECTURE.md`, and
`docs/agents/code.md`. It is read-only: it edits, commits, and pushes nothing, and runs no build,
suite, or preview except to test one suspicion. Ask it to read every changed file, to say which
it read, to mark each finding blocking or suggestion, and to find:

- behavior the change breaks, and cases it doesn't handle, each with the input or state that
  fails;
- an acceptance criterion in the issue that the change doesn't meet, and changed behavior with no
  test;
- a claim that holds by name but not by use: for everything the change moves, renames, removes,
  or relies on, where it is used;
- a layer rule broken in spirit where no lint catches it (`ARCHITECTURE.md`, Layers);
- data read without checking its shape where it enters (a response, a file, a request);
- a helper that duplicates one the repository already has;
- a doc that no longer matches the code.

Fix what it finds that holds up, then start another fresh one on the commits since, until a
review has no blocking finding. Count the rounds for the pull request.

## 4. Review the UI with fresh eyes

For a website change that adds or changes how pages look, start another subagent that has not
seen the work. Give it the changed pages' paths, `docs/agents/web.md` (UI components), and the
`verify-web` skill, and ask it to run the site and screenshot each changed page at desktop and
phone widths, in light and dark, next to `/products/` and a browse page, and to find:

- a hand-rolled element where a stock shadcn component exists (`apps/web/src/components/ui/`, or
  one the shadcn CLI adds);
- a `className` on a stock component that changes its size, padding, radius, border, colour, type
  size, or density, and any colour literal or arbitrary Tailwind value;
- headings, page width, spacing, cards, or tables that don't match the existing pages, or a table
  stretched beyond its content;
- clipping, sideways scrolling on a phone, a missing focus state, or anything that breaks in dark.

It reports each finding with the file, what the stock component or existing page does instead, and
the screenshot. Fix what holds up, then repeat from step 1 until a review finds nothing new.

## 5. Bring the records in line

- The product docs (`apps/*/docs/product/`) for any behavior change, with its check.
- The area's doc that `AGENTS.md` routes to, for how it works.
- `docs/quality.md` when an area's tests, CI, or docs changed.
- `docs/tech-debt.md`, or `docs/harness-debt.md` for checks, delivery, and the harness: add debt
  the change knowingly leaves, and remove what it paid off.
- An ADR when `docs/agents/domain.md` says one is warranted.

## 6. Draft the pull request

Give it a Conventional Commit title that names the outcome a user notices, and fill in the
template (`.github/pull_request_template.md`) for a reviewer who hasn't seen the work: the issue
it closes, why, what changed, what was left out and who can finish it (for example, Swift that
needs a Mac), the evidence by level (what step 2 showed, which checks ran and passed), how the
reviews went (such as `Review: 2 rounds, clean`), and its status (`docs/agents/code.md`, Pull
requests). Show it to the person before pushing or opening anything.

Once it's open, the `Code review` workflow reviews every push with the `pr-review` skill. Answer
each finding (fix it, or reply with why not), then run this skill again before the next push. A
finding can also be answered with an `@claude` request in its thread: the `Claude` workflow fixes
it on the pull request's branch and pushes, which starts a re-review (`docs/agents/ci-agents.md`,
@claude requests).

## 7. After it merges

Finished work leaves nothing behind (SERP's
[Housekeeping](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/housekeeping.md)):

- Confirm the issue closed: `gh issue view <number> --json state`. Close one the merge left open,
  with a comment that links the pull request, only if every acceptance item is done.
- In a worktree that made Simulators, `python3 apps/ios/Tools/simulator.py delete` removes them
  and the worktree's build folder. `prune` does the same for worktrees that are already gone.
- Run the housekeeping script's audit, read every bucket, then apply what it marks safe:
  `bash ~/.agents/skills/serp-housekeeping/scripts/housekeeping.sh`, and again with `--apply`. It
  comes with SERP's `serp-housekeeping` skill; without the skill, do by hand what the standard
  lists. `.housekeeping` names this repository's disposable paths. `tmp/agent/verify/` isn't one
  of them, so the proof of a run stays until a person deletes it.
- Ask before deleting anything with uncommitted or unpushed work.
