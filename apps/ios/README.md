# Zenbu Japanese iOS App

This directory owns the primary installed iOS product and its complete build, test, metadata, signing, and release boundary. Other delivery surfaces must not depend on this app's SwiftUI, Xcode, or release implementation merely because they share the repository.

## Entry points

- Open [`ZenbuJapanese.xcodeproj`](ZenbuJapanese.xcodeproj/) for the application and its Xcode test plans.
- [`App/`](App/) owns the application target and bundled resources.
- [`Modules/`](Modules/) owns Swift packages and Product Experience implementations used by the app.
- [`AppUITests/`](AppUITests/) and [`TestPlans/`](TestPlans/) own UI journeys and their Xcode plan membership.
- [`Tools/`](Tools/) owns repository-supported iOS validation and automation.

## Operating documentation

- [`CI.md`](CI.md) is the source of truth for test selection, merge gates, and verification cadence.
- [`VerificationPolicy.json`](VerificationPolicy.json) is the executable capability and lifecycle manifest.
- [`Verification/`](Verification/) indexes durable manual and regression evidence.
- [`ReleasePrivacyAudit.md`](ReleasePrivacyAudit.md) defines release privacy and security auditing.
- [`CHANGELOG.md`](CHANGELOG.md), [`screenshots/`](screenshots/), and [iOS release records](../../docs/releases/ios/) are owned by this delivery surface.

Cross-product language and decisions remain in the repository-level [`CONTEXT.md`](../../CONTEXT.md), [`docs/adr/`](../../docs/adr/), and [`docs/research/`](../../docs/research/) so this directory does not duplicate shared truth.
