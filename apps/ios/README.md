# Zenbu Japanese iOS App

This directory owns the primary installed iOS product and its complete build, metadata, signing, and release boundary. The legacy root [`metadata/`](../../metadata/) location remains an iOS-owned release-tooling input until a separately scoped migration proves every consumer. Other delivery surfaces must not depend on this app's SwiftUI, Xcode, or release implementation merely because they share the repository.

## Entry points

- Open [`ZenbuJapanese.xcodeproj`](ZenbuJapanese.xcodeproj/) for the application.
- [`App/`](App/) owns the application target and bundled resources.
- [`Modules/`](Modules/) owns Swift packages and Product Experience implementations used by the app.
- [`Tools/`](Tools/) owns repository-supported iOS language-data, privacy, parity, and release automation.

## Operating documentation

- [`docs/product/`](docs/product/) describes current user-facing iOS behavior.
- [`ReleasePrivacyAudit.md`](ReleasePrivacyAudit.md) defines release privacy and security auditing.
- [`CHANGELOG.md`](CHANGELOG.md), [`screenshots/`](screenshots/), and [iOS release records](../../docs/releases/ios/) are owned by this delivery surface.

Cross-product language and decisions remain in the repository-level [`CONTEXT.md`](../../CONTEXT.md), [`docs/adr/`](../../docs/adr/), and [`docs/research/`](../../docs/research/) so this directory does not duplicate shared truth.
