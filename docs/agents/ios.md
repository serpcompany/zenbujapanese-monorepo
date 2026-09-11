# iOS working guide

## Project

- Xcode project: `apps/ios/ZenbuJapanese.xcodeproj`
- Scheme: `ZenbuJapanese`
- App bundle identifier: `com.zenbujapanese.dictionary`
- Feature source: `apps/ios/Modules/Sources/SearchExperience/`
- Current product behavior: `apps/ios/docs/product/index.md`
- App Store metadata: `apps/ios/metadata/`

## Build and inspect

Use XcodeBuildMCP with an already-booted iOS Simulator. Set the project, scheme, Simulator ID, and `arm64` architecture in session defaults, then build and run. After launch, inspect the runtime UI before reporting success.

The current `sudachi-swift` XCFramework lacks an x86_64 Simulator slice, so generic dual-architecture Simulator builds fail at link time. Use an arm64 Simulator build with `ONLY_ACTIVE_ARCH=YES`.

Keep DerivedData, logs, screenshots, temporary inventories, and machine-specific Simulator identifiers out of the repository.

## Current verification boundary

This repository currently has no test targets or CI workflows. Issue [#329](https://github.com/serpcompany/zenbujapanese-monorepo/issues/329) owns the clean-slate replacement strategy. Verify ordinary changes by building and launching the real app; add test or CI infrastructure only through approved follow-up work from that strategy.
