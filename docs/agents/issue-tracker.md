# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues in `serpcompany/zenbujapanese-monorepo`. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --json number,title,body,state,labels,assignees,comments,url`. Filter the structured result only as the task requires.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply or remove labels**: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`
- **Close an issue**: `gh issue close <number> --comment "..."`

Infer the repository from `git remote -v`; `gh` does this automatically when run inside the clone.

## Pull requests as a triage surface

**PRs as a request surface: no.**

Set this to `yes` if this repo later treats external pull requests as feature requests. When enabled, use the corresponding `gh pr` commands and apply the same triage states.

GitHub shares one number space across issues and pull requests. For an ambiguous reference such as `#42`, try `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says “publish to the issue tracker”

Create a GitHub issue.

## When a skill says “fetch the relevant ticket”

Run `gh issue view <number> --json number,title,body,state,labels,assignees,comments,url`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes, Decisions-so-far, and Fog sections. Create it with `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map with GitHub's native sub-issue endpoint. Resolve the child's numeric database ID with `gh api repos/<owner>/<repo>/issues/<child-number> --jq .id`, then attach it with `gh api --method POST repos/<owner>/<repo>/issues/<map-number>/sub_issues -F sub_issue_id=<child-database-id>`. Where sub-issues are unavailable, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Apply a `wayfinder:<type>` label: `research`, `prototype`, `grilling`, or `task`. Once claimed, assign the ticket to the driving developer.
- **Blocking**: use GitHub's native issue dependencies. Resolve the blocker's numeric database ID, then add the relationship with `gh api --method POST repos/<owner>/<repo>/issues/<blocked-number>/dependencies/blocked_by -F issue_id=<blocker-database-id>`. The database ID is not the issue number or GraphQL node ID. Where dependencies are unavailable, add `Blocked by: #<n>, #<n>` at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children, drop issues with open blockers or an assignee, and take the first remaining issue in map order. GitHub exposes open blockers through the issue dependency relationship; closed blockers no longer gate the ticket.
- **Claim**: `gh issue edit <n> --add-assignee @me`; this is the session’s first write.
- **Resolve**: comment with the answer, close the issue, and append a context pointer to the map’s Decisions-so-far.
