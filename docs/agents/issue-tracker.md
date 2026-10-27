# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues in `serpcompany/zenbujapanese-monorepo`. Use the `gh` CLI for all operations, as `serp-agent[bot]` ([Outside CI](ci-agents.md#outside-ci)).

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --json number,title,body,state,labels,assignees,comments,url`. Filter the structured result only as the task requires.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply or remove labels**: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`
- **Close an issue**: `gh issue close <number> --comment "..."`

Infer the repository from `git remote -v`; `gh` does this automatically when run inside the clone.

## What an open issue means

An open issue means work is left to do. SERP's [Git Workflow](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/git-workflow.md#issues) has
the rules: an issue stands alone, one pull request closes each, a check that waits until after a
merge gets its own issue, and work that ends without a merge closes its issue with the reason.
Here:

- **Split work that needs several pull requests into sub-issues,** one pull request each
  (Wayfinding operations, below, has the commands). `Part of #N` and `Refs #N` close nothing, and
  the `Pull request` workflow fails a pull request that closes no issue
  ([`code.md`](code.md), Pull requests).
- **A plan lives in its issue, not in the repository.** Work that spans several pull requests
  gets a parent issue with its sub-issues in order and GitHub's "blocked by" links, and keeps
  four sections current: Progress, Surprises, Decision log, and Outcomes. A decision an owner
  gives in chat goes onto its issue in the same turn, since a chat ends with its session.
- **A new screen or page starts from mockups an owner approved.** Publish the options as one
  Artifact, link it on the issue, and record which the owner picked before building, as #679
  records its header's.
- **Close an issue only when every acceptance item is done on `main`,** shown by file and line
  or by a run. One that is partly done stays open: tick what is finished and comment with what
  is left. One that can't be judged without the running app or an owner stays open too. The
  audit's steps are in SERP's [Housekeeping](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/housekeeping.md#issue-audit).

## Labels

Every label in use is here. A new one is added to this table when it is created.

| Label | Meaning |
| --- | --- |
| `needs-triage` | A maintainer needs to evaluate the issue. |
| `needs-info` | Work is waiting for information from the reporter. |
| `ready-for-agent` | The issue is fully specified and ready for an autonomous agent. |
| `ready-for-human` | The issue requires human implementation or a human decision. |
| `wontfix` | The issue will not be worked on. |
| `brainstorm` | An idea with no acceptance criteria yet, so ready for nobody. It loses the label when it gets criteria. |
| `decision:agent-led` | The agent owns the technical defaults, and escalates a material product, privacy, cost, or irreversible choice. |
| `research-needed` | The issue can't be specified until something is found out. |
| `iOS`, `macOS`, `product:website`, `product:browser-extension-chromium`, `product:browser-extension-safari` | The product or platform the issue is about. |
| `ui`, `youtube` | The area: how something looks, or the Player's YouTube side. |
| `wayfinder:map`, `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, `wayfinder:task` | Wayfinding (below). |
| `bug`, `documentation`, `duplicate`, `enhancement`, `question` | GitHub's defaults, as named. |
| `search-parity-reviewed` | A search change meant for one implementation only. No issue carries it, and since every client runs the shared core (ADR 0008) none can: delete it. |

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
