# iOS working guide

## Build and inspect

Use XcodeBuildMCP to discover the project, scheme, and an already-booted iOS
Simulator from the current checkout. Build and run with the `arm64` architecture,
then inspect the launched app before reporting success.

The current `sudachi-swift` binary lacks an x86_64 Simulator slice. Use
`ONLY_ACTIVE_ARCH=YES`; a generic dual-architecture Simulator build fails at
link time.

## Current verification boundary

This repository currently has no test targets or CI workflows. Issue [#329](https://github.com/serpcompany/zenbujapanese-monorepo/issues/329) owns the clean-slate replacement strategy. Verify ordinary changes by building and launching the real app; add test or CI infrastructure only through approved follow-up work from that strategy.
