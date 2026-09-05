# Issue 258 Sudachi bundle and size evidence

Date: 2026-09-03

Fixed point: `bc2a6daac25b341d798e46bea83b5d10686ea8ce`

Configuration: unsigned arm64 iOS Release archive, Xcode 26.0 (`17A324`)

## Packaging decision

Git does not contain the wheel or expanded dictionary. A repository-owned Python
bootstrap downloads the exact official wheel into an external checksum-keyed
build cache, validates 72,275,897 bytes and SHA-256
`b3869ce6b12b4bfa09575dc19030703bb669ab41bac12a74cafcbb28c6be2498`,
extracts only `sudachidict_core/resources/system.dic`, and validates 217,466,039
bytes and SHA-256
`53fa281d11eef3769712fe1c3c892117338f9892bee6daf4dad51daa5281bb6f`.
The Xcode phase is offline-only and stages the expanded dictionary into the app
product after the explicit bootstrap. No wheel enters the app, and runtime reads
the immutable dictionary in place without an Application Support copy.

The final explicit bootstrap completed in 14.468 seconds with an empty cache,
including the official network transfer, validation, and extraction. A second
cache-only bootstrap completed in 0.205 seconds. The subsequent clean offline
Debug app build completed in 17.143 seconds and produced the same exact
dictionary.

## Before and after

| Measurement                    |    Baseline |   Candidate |                   Delta |
| ------------------------------ | ----------: | ----------: | ----------------------: |
| Release app logical file bytes | 546,514,534 | 763,997,102 | +217,482,568 (+39.794%) |
| Release app allocated bytes    | 546,598,912 | 764,084,224 | +217,485,312 (+39.789%) |
| Comparable local ZIP bytes     | 239,642,321 | 311,923,719 |  +72,281,398 (+30.162%) |
| Sudachi resource contribution  |           0 | 217,466,039 |            +217,466,039 |

The candidate contained exactly one `system_core.dic` and zero wheel files. The
16,529-byte logical delta beyond the dictionary itself is code/catalog metadata.
The dictionary is 28.464% of the candidate's logical app bytes.

### Thinned device download estimate

The arm64 iPhone Release archive's comparable compressed app is 311.924 MB. Its
72.281 MB delta over the same-configuration baseline is the measured compression
proxy for Apple's device-specific delivery. Applying that delta to the currently
published
[Zenbu Japanese size of 535.9 MB](https://apps.apple.com/jp/app/zenbu-japanese/id6800229215)
gives a clearly labeled estimate of 608.181 MB. The currently published
[Japanese Dictionary - Nihongo size is 497 MB](https://apps.apple.com/us/app/japanese-dictionary-nihongo/id881697245),
so that estimate is 111.181 MB or 22.371% larger. These public values can change
and were rechecked on 2026-09-03.

Apple's official thinned App Store report is not available from an unsigned
archive; producing it requires an exported signed candidate and is not claimed
here. The 608.181 MB value is therefore the requested thinned download estimate,
not an App Store Connect measurement.

## Fresh-install application data

A disposable iPhone 17 Pro Max / iOS 26.0 Simulator received a fresh install.
The app process used dead local HTTP and HTTPS proxies while opening the retained
vertical Image Text fixture with the real bundled analyzer.

| State                     | Logical app-data bytes | Allocated app-data bytes | Application Support dictionaries |
| ------------------------- | ---------------------: | -----------------------: | -------------------------------: |
| Immediately after install |                    524 |                    4,096 |                                0 |
| After first cold launch   |              2,777,218 |                2,801,664 |                                0 |
| After second cold launch  |              2,777,218 |                2,801,664 |                                0 |

The second launch added no data, and neither launch extracted or copied Sudachi.
The focused UI journey separately proved real bundled Image Text and Example
Sentence links across a cold relaunch before Settings was opened.

## Temporary build storage

The clean external cache retains the verified 72,275,897-byte wheel and
217,466,039-byte extracted dictionary: 289,741,936 payload bytes. The final tool
reports a measured peak payload of 507,207,975 bytes while atomically staging the
217,466,039-byte product copy. The temporary copy is atomically renamed and no
second dictionary is retained in app data. This is build-machine storage, not
end-user Application Support storage. The retained tool identity for this
measurement is contract
`a01117e8bb80cac7e882ae3c23e23b983525cfcd6e5f669b4a17999482ed7eb8`,
which includes the complete manifest plus preparation-tool SHA-256
`17d9d53591a319102dcbaa6a763aa38a034432873285003609cb9bd17ede4e93`.

## Archive evidence boundary

The final candidate archive completed in 30.982 seconds. Final unsigned archive
preflight completed in 30.582 seconds and produced canonical application SHA-256
`915706a1ecce424a52a2aae8db57e6168a6d5854fdc78a1210e395f9cb09eaf9`.
This is reproducible unsigned implementation evidence, not signed release or App
Store thinning evidence. The expanded negative archive harness passed in 4m55.84s
and proved missing, corrupt, duplicated, notice-less, stale-manifest,
detached-target, missing-SBOM, unreviewed-URL, and scanner-failure candidates fail
closed. An exact final-product mutation that added the wheel beside the expanded
dictionary also failed with the required duplicate-payload classification.
