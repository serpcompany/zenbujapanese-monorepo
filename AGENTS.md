# AGENTS

Routing only. Open the smallest source matching the task.

Stage: ship

Agents never merge: there is no `Agents may merge` line. Only an owner adds or changes these lines.

## Every change

- [`docs/agents/code.md`](docs/agents/code.md) — the rules all code follows (no comments, a file size limit, no duplicate or dead code, imports that follow the layers, no secrets, a test for every fix, docs that stay reachable), the checks and git hooks behind them, the skills, and when a change is done. Run `pnpm check` before a pull request.
- [`docs/agents/verification.md`](docs/agents/verification.md) — what to run while editing, before a push, and at the finish gate; how to wait; the evidence each kind of change needs (a preview, UI tests, a device, a deploy); and the ports, Simulator, and build folder a checkout uses.

## Commands

- **Finish gate:** `pnpm check` from the root, once, on the finished tree.
- **The checks:** `pnpm verify`, or some checks on some paths: `pnpm verify comments,sizes <paths>`.
- **Inner loop, a pnpm package:** `pnpm --filter <package> typecheck`, and `pnpm --filter <package> exec vitest related --run <files>`.
- **Inner loop, the app:** the tests the change touches, with `-only-testing`, on this checkout's own Simulator, whose UDID `python3 apps/ios/Tools/simulator.py` prints. Never `booted` or a default device.
- **Before a push:** `pnpm check` in each package the change touched.
- **In the running product:** the skills `verify-web` (the website), `verify-app` (the app), and `verify-service` (the two services), in `.claude/skills/`. Proof goes under `tmp/agent/verify/`.

## Codebase

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — the repository's parts, how data moves between them, and each part's enforced layers. Start here for anything that crosses parts.
- [`docs/technologies.md`](docs/technologies.md) — technology implementations, roles, and current consumers.
- [`docs/data-sources.md`](docs/data-sources.md) — supplied information, source roles, and current consumers.
- [`docs/agents/ios.md`](docs/agents/ios.md) — Xcode build and launch on iPhone, iPad, and the Mac, the platform adapters, installing on an iPhone, Simulator verification, and the current iOS test and CI boundary.
- [`docs/agents/translate.md`](docs/agents/translate.md) — the iOS Translate tab: its engine target, the on-device speech and translation adapters, its tests, the Simulator harness, and device checks.
- [`docs/agents/web.md`](docs/agents/web.md) — zenbujapanese.com: run, verify, the dictionary service it reads, the account pages, environments, deploys, and sitemaps.- [`docs/agents/dictionary-api.md`](docs/agents/dictionary-api.md) — the website's dictionary service: run, check, routes, the Docker image, and deploying it.
- [`docs/agents/account-api.md`](docs/agents/account-api.md) — the account service: run, check, routes, its Postgres and migrations, the Docker image, deploying it, and backups.
- [`docs/agents/account-clients.md`](docs/agents/account-clients.md) — building an app on the Zenbu account: its scopes, signing in, tokens, the profile, when and how to sync, errors, and deleting the account.
- [`docs/api/`](docs/api/) — the services' API references, written from their OpenAPI documents: each route with its auth and scopes, fields and bounds, error codes, and sync entities ([`account-api.md`](docs/api/account-api.md), and the dictionary service's routes for apps, [`dictionary-api.md`](docs/api/dictionary-api.md)). Tests write them; never edit by hand.
- [`docs/agents/api-servers.md`](docs/agents/api-servers.md) — the server the services run on: the deployer, its slots, its Slack alerts and tests, and setting the server up.
- [`docs/agents/dictionary-core.md`](docs/agents/dictionary-core.md) — the shared TypeScript dictionary core: what it ports, its rules, and its checks.
- [`docs/agents/ci.md`](docs/agents/ci.md) — every GitHub Actions workflow and what starts it, the checks a merge can wait for, and each workflow that checks a pull request: what it runs, and why.
- [`docs/agents/ci-agents.md`](docs/agents/ci-agents.md) — the workflows Claude runs in: the review of every pull request, `@claude` requests, weekly maintenance, and the app and token they use.
- [`docs/agents/ci-deploys.md`](docs/agents/ci-deploys.md) — the workflows that deploy the site, ship the services' images, and publish language data, and the actions pinned by commit.
- [`language-data/README.md`](language-data/README.md) — language-data releases: the manifest, what a release packages, the build workflow, and publishing to R2.
- [`apps/ios/docs/product/index.md`](apps/ios/docs/product/index.md) — durable current iOS behavior. Open only the relevant linked document. Update applicable product documentation and verification in the same PR as a behavior change.
- [`apps/web/docs/product/index.md`](apps/web/docs/product/index.md) — durable current website behavior and the automated check for each. Open only the relevant page's section. Update the behavior and its check in the same PR as a behavior change.

## Work tracking

- [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md) — proposed user stories, feature changes, discovery evidence, acceptance criteria, and other issue or PRD work.
- [`docs/quality.md`](docs/quality.md) — a grade for each product area and layer, the app's and the website's in the two files it links, with the code it covers (Code) and the day it was graded (Graded). Re-grade a row, and set its Graded date, when its tests, CI, or docs change; the weekly report lists the rows whose code changed since.
- [`docs/tech-debt.md`](docs/tech-debt.md), and [`docs/harness-debt.md`](docs/harness-debt.md) for the checks, delivery, and the harness — known debt, each item with its issue and a Size (small, medium, or large). Add debt you knowingly leave, with its Size; remove what you pay off.

## Decisions

- [`docs/adr/`](docs/adr/) — architecture changes. Read only the relevant records.
- [`docs/agents/domain.md`](docs/agents/domain.md) — project terminology and deciding whether an ADR is warranted.
- [`CONTEXT.md`](CONTEXT.md) — terms that are easy to confuse, such as Language Reference ID and JMdict entry number.

## Where this differs from SERP's standards

SERP's [engineering standards](https://github.com/serpcompany/serp/tree/main/docs/engineering/standards) apply. Where one says otherwise, these win:

- **No comments in code,** checked. Why something is built as it is goes in the docs ([`code.md`](docs/agents/code.md), No comments).
- **Merge commits, through a merge queue,** not squash merges. Branches are named `<type>/<issue>-<slug>` and brought up to date by merging `main`, never by rebasing ([`code.md`](docs/agents/code.md), Pull requests).
- **One pipeline from `main`,** staging and then production, with no `staging` branch ([`ci-deploys.md`](docs/agents/ci-deploys.md)).
- **Review runs on every push, beside CI,** not once CI is green ([`ci-agents.md`](docs/agents/ci-agents.md), Code review).
- **Only the root `README.md` is a map.** A component's `README.md` is a leaf, with a leaf's size budget ([`code.md`](docs/agents/code.md), Docs).
- **A Debug build keeps the release bundle identifier,** with no `.debug` suffix ([`verification.md`](docs/agents/verification.md), This checkout's Simulator and build folder).

## Evidence and research

- [`docs/agents/clipy.md`](docs/agents/clipy.md) — feedback supplied as a Clipy recording.
- [`zenbujapanese/research`](https://github.com/zenbujapanese/research) — private repository for exploratory research and archived reference evidence.
