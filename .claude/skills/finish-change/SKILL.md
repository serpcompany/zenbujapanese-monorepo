---
name: finish-change
description: Take a change in this repository from "the code works" to "ready for a pull request". Runs every check, drives a website change in the browser, has a fresh agent review the diff against the repository's rules and a website change's pages against stock shadcn and the existing pages, brings the docs, quality grades, and debt list in line, and drafts the pull request. Use before opening or updating a pull request, and after answering review feedback.
---

# Finish a change

A change is done when `docs/agents/code.md` says it is. This is the loop that gets it there. Stop
and ask the person only when a step needs their judgment: a product decision, a rule that seems
wrong, or anything outward-facing (a push, a pull request, a comment).

## 1. Check it

Run `pnpm check` from the repository root. For a change to `language-data`, also run the
pipeline's tests (`language-data/README.md`). Fix what fails and run it again; never loosen a check
or add an exception to pass it. A rule that really can't be met goes to the person, with why.

## 2. Show it working

- A website change: run `pnpm test:e2e` in `apps/web`, adding a browser test for what the change
  adds and a regression test for a bug it fixes (the `browser-tests` skill). Then use the
  `verify-web` skill, and keep what it showed (the pages, snapshots, and screenshots) for the pull
  request.
- A dictionary or account service change: run it as `docs/agents/dictionary-api.md` or
  `docs/agents/account-api.md` says, and call the routes the change touches.
- A Swift change: this machine may not build it (`docs/agents/ios.md`). Say so in the pull request
  rather than claiming it works.

## 3. Review the diff with fresh eyes

Start a subagent that has not seen the work, and give it only `git diff main...HEAD` plus the
uncommitted diff, `AGENTS.md`, `ARCHITECTURE.md`, and `docs/agents/code.md`. Ask it to find:

- behavior the change breaks, and cases it doesn't handle;
- a layer rule broken in spirit where no lint catches it (`ARCHITECTURE.md`, Layers);
- data read without checking its shape where it enters (a response, a file, a request);
- a helper that duplicates one the repository already has;
- a doc that no longer matches the code.

Fix what it finds that holds up, then repeat from step 1 until a review finds nothing new.

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
- `docs/tech-debt.md`: add debt the change knowingly leaves, and remove what it paid off.
- An ADR when `docs/agents/domain.md` says one is warranted.

## 6. Draft the pull request

Write the description for a reviewer who hasn't seen the work: what changed and why, what step 2
showed, which checks ran and passed, and what was left and who can finish it (for example, Swift
that needs a Mac). Show it to the person before pushing or opening anything.

Once it's open, the `Code review` workflow reviews every push with the `pr-review` skill. Answer
each finding (fix it, or reply with why not), then run this skill again before the next push. A
finding can also be answered with an `@claude` request in its thread: the `Claude` workflow fixes
it on the pull request's branch and pushes, which starts a re-review (`docs/agents/ci.md`,
@claude requests).
