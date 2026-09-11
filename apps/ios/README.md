# Zenbu Japanese iOS App

This directory owns the primary installed iOS product and its complete build, metadata, signing, and release boundary. Other delivery surfaces must not depend on this app's SwiftUI, Xcode, or release implementation merely because they share the repository.

## Entry points

- Open [`ZenbuJapanese.xcodeproj`](ZenbuJapanese.xcodeproj/) for the application.
- [`App/`](App/) owns the application target and bundled resources.
- [`Modules/`](Modules/) owns Swift packages and Product Experience implementations used by the app.
- [`Tools/`](Tools/) owns repository-supported iOS language-data import and build preparation tools.
- [`metadata/`](metadata/) contains the canonical App Store metadata consumed by `asc metadata` commands.

## Operating documentation

- [`docs/product/`](docs/product/) describes current user-facing iOS behavior.
- [GitHub Releases](https://github.com/serpcompany/zenbujapanese-monorepo/releases) contains completed release records.
- [`CHANGELOG.md`](CHANGELOG.md) and [`screenshots/`](screenshots/) are owned by this delivery surface.

Cross-product language and architectural decisions remain in the repository-level [`CONTEXT.md`](../../CONTEXT.md) and [`docs/adr/`](../../docs/adr/). Exploratory research and archived evidence live in the private [`zenbujapanese/research`](https://github.com/zenbujapanese/research) repository.
