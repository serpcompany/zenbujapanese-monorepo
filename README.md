# Zenbu Japanese

Zenbu Japanese is a connected set of Japanese-learning experiences organized
around one learning journey. The repository's implemented and released product
surface is currently the [Zenbu Japanese iOS App](apps/ios/), which provides
offline Lookup and related learning flows.

The longer-term product direction includes additional Product Experiences and
Shared Capabilities that can work together across Zenbu. Those surfaces are
described here as product intent; their presence in documentation does not mean
that a website, browser extension, account system, sync service, or additional
client has been implemented in this repository.

## Repository guide

- [Domain language](CONTEXT.md) defines the shared product and engineering
  vocabulary.
- [Architecture decisions](docs/adr/) record settled technical and product
  boundaries.
- [Release records](docs/releases/) contain version history, release artifacts,
  and verification evidence.
- [Product documentation](docs/product/) describes established Product
  Experiences and Shared Capabilities.
- [Product ideas](docs/product-ideas/) are exploratory and do not establish an
  implementation commitment.
- [Research](docs/research/) preserves source-backed investigations and
  technical findings.
- [Agent documentation](AGENTS.md) provides the entry point for repository
  workflows, with supporting instructions under [`docs/agents/`](docs/agents/).
- [Project-wide assets](assets/) contain reusable source assets and provenance;
  compiled client assets remain with their client.

Completed migration evidence under `docs/plans/completed/` is historical and
does not override the domain model, ADRs, or current GitHub issues.

## iOS development

Open [`apps/ios/ZenbuJapanese.xcodeproj`](apps/ios/ZenbuJapanese.xcodeproj) in
Xcode. The application target, UI tests, test plans, tools, language-data
provenance, and verification records all live under [`apps/ios/`](apps/ios/).

Release history and the release evidence index begin at
[`docs/releases/1.0.0.md`](docs/releases/1.0.0.md). Work requests and product
decisions are tracked in [GitHub Issues](https://github.com/serpcompany/zenbujapanese-monorepo/issues).
