# Gate 1 identity verification

Captured on 2026-08-14 from `agent/issue-141-identity`. Production code is
organized under `SearchExperience`: the domain context defines a Product
Experience as the self-contained user-facing area that owns a purpose and its
flows, and this target owns the focused Search/dictionary experience. The
rename does not add a new architecture layer or change product behavior.

## Screen-by-screen de-branding review

Every material Release surface was inspected in both approved appearances.
All captures are app-owned 1170 by 2532 simulator screenshots; private
reference captures are not included. The review found only Zenbu identity,
Search and Settings navigation, the approved red/neutral colors, and existing
typography and geometry.

| Material surface | Light evidence | Dark evidence | Result |
| --- | --- | --- | --- |
| Search | `search-light.png` | `search-dark.png` | Clear |
| Settings / Dictionary Sources | `settings-light.png` | `settings-dark.png` | Clear |
| Word Detail | `word-detail-light.png` | `word-detail-dark.png` | Clear |
| Example Sentences | `example-sentences-light.png` | `example-sentences-dark.png` | Clear |
| Conjugations | `conjugations-light.png` | `conjugations-dark.png` | Clear |
| Kanji Detail | `kanji-detail-light.png` | `kanji-detail-dark.png` | Clear |
| Stroke Order | `stroke-order-light.png` | `stroke-order-dark.png` | Clear |
| Kanji Element Detail | `kanji-element-detail-light.png` | `kanji-element-detail-dark.png` | Clear |
| Radical input | `radical-input-light.png` | `radical-input-dark.png` | Clear |
| Handwriting input | `handwriting-input-light.png` | `handwriting-input-dark.png` | Clear |
| Image Text entry menu | `image-text-light.png` | `image-text-dark.png` | Clear |

The clean light suite result is
`/tmp/ZenbuJapanese-issue-141-clean-full-v2.xcresult`. Corrected dark coverage
used `/tmp/ZenbuJapanese-issue-141-dark-coverage-isolated.xcresult`,
`/tmp/ZenbuJapanese-issue-141-common-isolated.xcresult`, and the focused clean
Image Text menu result
`/tmp/ZenbuJapanese-issue-141-dark-image-menu.xcresult`.

## Complete simulator suite

The final acceptance run used the dedicated `Zenbu Issue 141 iPhone 16e`
simulator (`08C18111-0DEA-43B4-9590-0991BD6426F5`) on iOS 26.0.1 with parallel
testing disabled. The simulator was erased first and seeded with exactly one
Japanese image so the public photo-picker journey had deterministic media.

- 75 tests executed in one uninterrupted run.
- 74 passed.
- 0 failed.
- 1 skipped: camera capture requires the signed physical-device fixture rig.
- XCTest duration: 1518.718 seconds.

An earlier complete diagnostic run had 73 passed, one failed photo-library OCR
assertion, and one camera skip because its Photos library was not freshly
seeded. It is not counted as acceptance and was not replaced by an isolated
rerun.

The parity-ledger unit suite also passed: 36 passed, 0 failed.

## Whole Release archive inspection

The final unsigned generic-device archive succeeded at
`/tmp/ZenbuJapanese-issue-141-corrected-final.xcarchive`. The scan inspected all
24 files in the archive, including the app, resources, compiled Core ML model,
and dSYM.

- `CFBundleDisplayName` and `CFBundleName`: `Zenbu Japanese`.
- `CFBundleIdentifier`: `com.zenbujapanese.dictionary`.
- Strict whole-archive search returned zero matches for `Nihongo Pro`,
  `NihongoClone`, acceptance-replica/module/test identities, old tab identifiers,
  internal scope copy, Clippings, or Flashcards.
- A generic whole-archive search excluding the canonical language database
  returned zero matches for whole-word `Nihongo`, `replica`, `clone`, `fixture`,
  or `side-by-side`.
- No prohibited filename, private evidence/fixture directory, reference capture,
  side-by-side media, or Image Text fixture media exists in the archive.
- The compiled DaKanji metadata author is `DaKanji contributors; Core ML
  conversion by Zenbu / SERP`; the former internal conversion identity is gone.
- `LanguageReferenceData.sqlite3` passed `PRAGMA integrity_check` and has no
  prohibited schema/table identity. Lexical row scans intentionally find normal
  dictionary/example content: romanized Japanese-language terms, English
  senses such as “replica firearm” and “clone,” “permanent fixture” in a Tatoeba
  sentence, and the proper title “Nihongo Daijiten.” These are canonical
  language records, not app identity, prototype branding, internal identifiers,
  or private evidence; removing them would corrupt the dictionary corpus.

## Icon and provenance

- Source AppIcon: 1024 by 1024 and opaque (`hasAlpha: no`).
- Compiled 120 by 120 and 152 by 152 icon PNGs are opaque.
- The compiled asset catalog contains two phone AppIcon renditions.
- `shasum -a 256 -c SHA256SUMS.txt` passed for both the retained complete owner
  pack and installed AppIcon.

## USB physical-device status

A signed smoke was attempted only against the owner-specified USB iPhone 14 Pro
Max (`00008120-00040469019B401E`). Xcode timed out before build/test because the
destination was busy waiting to reconnect; `devicectl` then reported
`connected (no DDI)`. No physical test executed, no signing result is claimed,
and the paired iPhone 17 Pro Max was not used as a fallback. Physical camera
acceptance remains a human/device-environment follow-up.

The Release archive used `CODE_SIGNING_ALLOWED=NO`. App Store Connect and
submission were not touched.
