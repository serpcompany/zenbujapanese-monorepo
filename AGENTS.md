# AGENTS

Routing only. Open the smallest source matching the task.

## Every change

- [`docs/agents/code.md`](docs/agents/code.md) — the rules all code follows (no comments, a file size limit, no duplicate or dead code, imports that follow the layers, no secrets, a test for every fix, docs that stay reachable), the checks and git hooks behind them, the skills, and when a change is done. Run `pnpm check` before a pull request.

## Codebase

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — the repository's parts, how data moves between them, and each part's enforced layers. Start here for anything that crosses parts.
- [`docs/technologies.md`](docs/technologies.md) — technology implementations, roles, and current consumers.
- [`docs/data-sources.md`](docs/data-sources.md) — supplied information, source roles, and current consumers.
- [`docs/agents/ios.md`](docs/agents/ios.md) — Xcode build and launch, installing on an iPhone, Simulator verification, and the current iOS test and CI boundary.
- [`docs/agents/translate.md`](docs/agents/translate.md) — the iOS Translate tab: its engine target, the on-device speech and translation adapters, its tests, the Simulator harness, and device checks.
- [`docs/agents/web.md`](docs/agents/web.md) — zenbujapanese.com: run, verify, the dictionary service it reads, environments, deploys, and sitemaps.
- [`docs/agents/dictionary-api.md`](docs/agents/dictionary-api.md) — the website's dictionary service: run, check, routes, the Docker image, and deploying it.
- [`docs/agents/dictionary-core.md`](docs/agents/dictionary-core.md) — the shared TypeScript dictionary core: what it ports, its rules, and its checks.
- [`docs/agents/ci.md`](docs/agents/ci.md) — every GitHub Actions workflow: what starts it, what it runs, and why.
- [`language-data/README.md`](language-data/README.md) — language-data releases: the manifest, what a release packages, the build workflow, and publishing to R2.
- [`apps/ios/docs/product/index.md`](apps/ios/docs/product/index.md) — durable current iOS behavior. Open only the relevant linked document. Update applicable product documentation and verification in the same PR as a behavior change.
- [`apps/web/docs/product/index.md`](apps/web/docs/product/index.md) — durable current website behavior and the automated check for each. Open only the relevant page's section. Update the behavior and its check in the same PR as a behavior change.

## Work tracking

- [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md) — proposed user stories, feature changes, discovery evidence, acceptance criteria, and other issue or PRD work.
- [`docs/quality.md`](docs/quality.md) — a grade for each product area and layer, with the code it covers (Code) and the day it was graded (Graded). Re-grade a row, and set its Graded date, when its tests, CI, or docs change; the weekly report lists the rows whose code changed since.
- [`docs/tech-debt.md`](docs/tech-debt.md) — known debt, each item with its issue and a Size (small, medium, or large). Add debt you knowingly leave, with its Size; remove what you pay off.

## Decisions

- [`docs/adr/`](docs/adr/) — architecture changes. Read only the relevant records.
- [`docs/agents/domain.md`](docs/agents/domain.md) — project terminology and deciding whether an ADR is warranted.
- [`CONTEXT.md`](CONTEXT.md) — terms that are easy to confuse, such as Language Reference ID and JMdict entry number.

## Evidence and research

- [`docs/agents/clipy.md`](docs/agents/clipy.md) — feedback supplied as a Clipy recording.
- [`zenbujapanese/research`](https://github.com/zenbujapanese/research) — private repository for exploratory research and archived reference evidence.
