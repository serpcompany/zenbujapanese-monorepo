# Inspect a kanji element and its roles evidence

Three public UI tests exercise the fixed `静 → 争/青` journey through Kanji Detail, an app-owned element destination, alternative and standalone forms, linked kanji roles, and every Back edge. They also prove that a source-load failure is distinct from missing data and that Retry recovers through the live bundled source.

The manifest retains five unique, non-failure 1320 × 2868 screenshots on the iPhone 17 Pro Max / iOS 26.0.1 Simulator:

- `A8073CF6-0151-477F-8914-0005936DC9D8.png`: `静` Kanji Detail exposes operable `争` and `青` element rows.
- `D4C04F4F-F1BA-418E-A118-0784B9141097.png`: the traditional `爭` element's scrolled containing-kanji roles.
- `408AB578-5263-48FE-B368-A75C9BA14C12.png`: nested Back immediately restores the originating `静` element viewport.
- `036A60F7-222A-4770-96E0-689E3F5151EB.png`: linked `清` navigation immediately returns to the same `青` role-list viewport.
- `3B6E5D69-27D5-4782-90FD-B4C9186AF8B6.png`: public Retry recovers the real `青` element, readings, standalone form, and containing-kanji rows.

The complete final iOS UI suite passed on that simulator: 49 passed, 0 failed, 0 skipped. Three retained images come from that exact final bundle. The `爭` role list and recovered `青` overview come from the immediately preceding 3/3 focused run of the same final code because its frames contained settled status/navigation chrome; their corresponding public tests also passed in the final 49/49 bundle. A Release simulator build also passed.

## Source and transform

Zenbu normalizes pinned Kanjium commit `8a0cdaa16d64a281a2048de2eee2ec5e3a440fa6` into app-owned element, role, contribution, and provenance models, while retaining Kanjium structure provenance separately from the pinned `2026-08-10` EDRDG KANJIDIC2 meaning/reading provenance. The source SQLite SHA-256 is `793a4e80fd1da3155a2ec9cf69db7376f46283ece5cb877a65f5d02557ed3613`; the deterministic runtime artifact SHA-256 is `ec160ef29ddd5bd4a81835605a8d240af31140cc695a05eaace83a79a8e8a423`. The artifact contains 1,698 elements, 6,656 kanji with elements, 14,874 relationships, and 1,238 alternative relationships. Dictionary Sources exposes Kanjium/EDRDG attribution, the pinned snapshots, and CC BY-SA 4.0 terms; the importer rejects a KANJIDIC2 artifact that does not match its manifest, and the update checker compares both the pinned Kanjium bytes and latest upstream commit.

## Named differences and boundaries

- `ENVIRONMENT-DIFFERENCE-001`: verification used the available iPhone 17 Pro Max iOS 26.0.1 Simulator; the fixed reference authority used physical iPhone 17 Pro Max on iOS 26.5.2.
- `SOURCE-DIFFERENCE-ELEMENT-001`: the pinned open data explicitly marks `青` as the phonetic element for `静`; it represents `争` as a structural element sharing recorded on-reading patterns. Zenbu does not invent the private reference app's unsupported causal `争 → ジョウ` claim.
- `SOURCE-DIFFERENCE-ELEMENT-002`: contribution counts, variant ordering, and role ordering are deterministic functions of Zenbu's pinned source, not Nihongo's unavailable private denominator.
- `RECOVERY-DIFFERENCE-ELEMENT-001`: source failure and public Retry are app-owned recovery presentation exercised through a DEBUG-only fail-once composition seam; production always uses the live bundled capability.
- `ASSET-SUBSTITUTE-001`: navigation and tab glyphs use SF Symbols under the dossier's approved asset variance.
- `UNCAPTURED-ELEMENT-001`: absent optional sections, deep navigation cycles, and element graphs beyond the fixed public denominator remain unclaimed.
- `JOURNEY-OWNERSHIP-KANJI-NOTES-001`: Kanji note creation and persistence remain outside this journey.

This journey creates no durable product output. All element and linked-kanji facts load offline from bundled Language Reference Data behind the focused `KanjiElementLookupClient` capability.
