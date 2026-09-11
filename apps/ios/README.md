# Zenbu Japanese iOS App

This directory owns the primary installed iOS product and its complete build, metadata, signing, and release boundary. Other delivery surfaces must not depend on this app's SwiftUI, Xcode, or release implementation merely because they share the repository.

## Entry points

- Open [`ZenbuJapanese.xcodeproj`](ZenbuJapanese.xcodeproj/) for the application.
- [`App/`](App/) owns the application target and bundled resources.
- [`Modules/`](Modules/) owns Swift packages and Product Experience implementations used by the app.
- [`Tools/`](Tools/) owns repository-supported iOS language-data, privacy, parity, and release automation.
- [`metadata/`](metadata/) contains the canonical App Store metadata consumed by `asc metadata` commands.

## Operating documentation

- [`docs/product/`](docs/product/) describes current user-facing iOS behavior.
- [`docs/releases/`](docs/releases/) contains immutable records of completed iOS releases.
- [`ReleasePrivacyAudit.md`](ReleasePrivacyAudit.md) defines release privacy and security auditing.
- [`CHANGELOG.md`](CHANGELOG.md) and [`screenshots/`](screenshots/) are owned by this delivery surface.

Cross-product language and decisions remain in the repository-level [`CONTEXT.md`](../../CONTEXT.md), [`docs/adr/`](../../docs/adr/), and [`docs/research/`](../../docs/research/) so this directory does not duplicate shared truth.
