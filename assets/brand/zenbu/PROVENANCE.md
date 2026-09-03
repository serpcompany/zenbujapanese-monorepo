# Zenbu Japanese icon provenance

Devin Schumacher created the original `全` artwork and affirmed unrestricted
commercial distribution rights for SERP/Zenbu. The owner-supplied production
export pack was frozen on 2026-08-14.

## Working asset library

The unpacked `master/`, `vector/`, `android/`, `extensions/`, `ios/`, `macos/`,
`web/`, and `windows/` directories are the reusable project-wide asset library.
[ASSET-CATALOG.md](ASSET-CATALOG.md) explains the source formats, platform
exports, and recommended defaults.
[ORIGINAL-ASSET-SHA256SUMS.txt](ORIGINAL-ASSET-SHA256SUMS.txt) is the immutable
manifest proving that every initial working asset matches the original pack.

The [compiled iOS asset catalog](../../../apps/ios/App/Assets.xcassets/AppIcon.appiconset/)
remains app-local and uses the working library's opaque
`ios/AppIcon.appiconset/icon-1024.png` export. Do not edit a generated platform
export independently of its master or vector source; review future brand
changes as explicit source-and-export updates.

## Original handoff

The original `zenbu-icon-pack-complete.zip` is not duplicated in the current
tree. It remains recoverable from tag `v1.0.0` at
`apps/ios/Brand/zenbu-icon-pack-complete.zip` with SHA-256
`aba6ff0e313298d4bef0e2b00a265eb9892a41ad1816e6eb95f4d02e823a3b8f`.

The initial opaque iOS marketing export has SHA-256
`80dd5f9d3333962f802b9c019110e9d8aa5c5c2bc2330bf96c955a1c54797c9d`.
These project-wide sources and exports are not included automatically in an
application target or Release archive.
