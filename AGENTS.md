# AGENTS

Routing only. Open the smallest source matching the task.

## Codebase

- [`docs/technologies.md`](docs/technologies.md) — technology implementations, roles, and current consumers.
- [`docs/data-sources.md`](docs/data-sources.md) — supplied information, source roles, and current consumers.
- [`docs/agents/ios.md`](docs/agents/ios.md) — Xcode build and launch, Simulator verification, and the current iOS test and CI boundary.
- [`docs/agents/web.md`](docs/agents/web.md) — zenbujapanese.com: run, verify, the dictionary service it reads, environments, deploys, D1 migrations, and sitemaps.
- [`docs/agents/dictionary-api.md`](docs/agents/dictionary-api.md) — the website's dictionary service: run, check, routes, and the Docker image.
- [`docs/agents/dictionary-core.md`](docs/agents/dictionary-core.md) — the shared TypeScript dictionary core: what it ports, its rules, and its checks.
- [`apps/ios/docs/product/index.md`](apps/ios/docs/product/index.md) — durable current iOS behavior. Open only the relevant linked document. Update applicable product documentation and verification in the same PR as a behavior change.
- [`apps/web/docs/product/index.md`](apps/web/docs/product/index.md) — durable current website behavior and the automated check for each. Open only the relevant page's section. Update the behavior and its check in the same PR as a behavior change.

## Work tracking

- [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md) — proposed user stories, feature changes, discovery evidence, acceptance criteria, and other issue or PRD work.

## Decisions

- [`docs/adr/`](docs/adr/) — architecture changes. Read only the relevant records.
- [`docs/agents/domain.md`](docs/agents/domain.md) — project terminology and deciding whether an ADR is warranted.
- [`CONTEXT.md`](CONTEXT.md) — terms that are easy to confuse, such as Language Reference ID and JMdict entry number.

## Evidence and research

- [`docs/agents/clipy.md`](docs/agents/clipy.md) — feedback supplied as a Clipy recording.
- [`zenbujapanese/research`](https://github.com/zenbujapanese/research) — private repository for exploratory research and archived reference evidence.
