# Nihongo reference authority

Status: **reset in progress under [#168](https://github.com/serpcompany/zenbujapanese-monorepo/issues/168)**.

Current-version authority is restored only for the bounded anchors replayed in
the [Nihongo 1.34.4 report](../../research/nihongo-reference-authority-1.34.4-2026-08-16.md).
Complete deeper-row and replacement-holdout acceptance does not yet exist.

## Historical authority

The discovery dossier, public screenshots, #147 research, and #152 retired
holdout record were captured from the genuine App Store application:

- bundle identifier: `com.serpentisei.studyjapanese`;
- displayed product: Nihongo;
- version/build: 1.34.3 (9792); and
- reference device class: physical iPhone 17 Pro Max.

Those records remain truthful evidence of Nihongo 1.34.3. They must not be
silently relabeled, regenerated, or described as observations of 1.34.4.

## Current-version boundary

[Apple's public App Store metadata](https://apps.apple.com/us/app/japanese-dictionary-nihongo/id881697245)
identifies Nihongo 1.34.4 as the current version and records a 2026-07-13
release. Version 1.34.4 predates the first
1.34.3 discovery commit on 2026-08-02. Consequently, all behavior conclusions
that depend on exact Nihongo output are provisional for the current version
until #168 replays and classifies them.

This affects parity claims about Search grouping/order, Dictionary Best
Matches and Primary Dictionary Entry selection, direct and entry-routed
Example Sentence Match/Ranking, exact visible counts, navigation, and visual
behavior. It does not by itself invalidate app-owned identifiers, source
provenance, deterministic imports, integrity checks, privacy controls, or
other implementation facts that do not depend on reference output.

The 1.34.3 release evidence remains valid as historical discovery input. It is
not current release acceptance, a tuning target, or authority to merge or
close #152–#166.

## Required preflight

Before any new reference or side-by-side capture, use the physical iPhone 14
Pro Max as the single HIL phone:

1. Inventory every physical target with `devicectl device info apps
   --include-all-apps`; the default command lists only developer apps and is
   insufficient.
2. Require exactly one genuine Nihongo 1.34.4 installation and exactly one
   Zenbu candidate installation on that phone. Reject obsolete clone/replica
   bundles.
3. Resolve the reference by exact bundle identifier, version, device model,
   and visible identity. Launch `com.serpentisei.studyjapanese` explicitly,
   complete the frozen reference phase, and seal that evidence before
   observing the candidate for the same contexts.
4. Resolve the candidate by exact source commit, built artifact, bundle
   identifier, device model, and visible identity. Launch
   `com.zenbujapanese.dictionary` explicitly for the candidate phase. The two
   applications may coexist because their exact bundle identities and the
   reference-first phase boundary are enforced.
5. Reject ambiguous archives, generic simulator destinations, booted
   simulator contamination, and stale temporary build selection.
6. Keep invalid or mixed-role captures outside Git under an explicit
   `INVALID` marker.

Only a bounded, frozen 1.34.3-to-1.34.4 comparison may restore current-version
authority. Differences must be classified before implementation; no
query-specific tuning or replacement holdout selection is permitted.

Run the executable guard from the exact candidate checkout with explicit
private device identifiers and one explicit built app path; never commit those
values:

```sh
node /absolute/path/to/apps/ios/Tools/hil-identity-preflight.mjs \
  --hil-device "$HIL_DEVICE" \
  --candidate-artifact "/absolute/path/to/Zenbu Japanese.app" \
  --expected-commit "$(git rev-parse HEAD)" \
  --simulator-destination "Zenbu Issue 141 iPhone 16e"
```

The guard performs its own `--include-all-apps` inventory and exits nonzero for
a stale reference version, missing or ambiguous exact apps, obsolete clone
installs, ambiguous artifacts, stale source commits, generic simulator names,
or any booted simulator. A failed guard is an informal-browsing state at most,
never HIL.
