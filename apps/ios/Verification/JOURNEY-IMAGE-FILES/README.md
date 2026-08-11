# Image Text Flow verification

Five public UI tests cover the real Files picker, the clear horizontal journey, vertical text, multiple-page empty/noisy/sparse recovery, and recognized Japanese with no dictionary match. Nine settled screenshots are retained for the three journeys that record visual checkpoints.

The complete iOS UI suite passed on an iPhone 17 Pro Max iOS 26.0.1 simulator: 54 passed, 0 failed, 0 skipped. Eight retained images come from that exact bundle: `/Users/devin/Library/Developer/XcodeBuildMCP/workspaces/zenbujapanese-monorepo-6e979e01018b/result-bundles/test_sim_2026-08-11T05-22-17-270Z_pid40723_42e32b91.xcresult`. The complete-chrome Natural Translation frame comes from the immediately preceding 2/2 focused run of the same final product code: `/Users/devin/Library/Developer/XcodeBuildMCP/workspaces/zenbujapanese-monorepo-6e979e01018b/result-bundles/test_sim_2026-08-11T04-53-35-670Z_pid40723_01804d5d.xcresult`; its public test also passed in the final 54/54 bundle. A Release simulator build also passed, contains none of the DEBUG fixture PNGs, and does not enable file sharing or opening documents in place.

## Retained states

- `20542210-6B38-42A2-B1D6-D54A78110FB5.png`: clear horizontal OCR with selectable regions and the explicit Natural Translation action.
- `6F60ADF2-30BF-48A8-A0FE-6377369E7F1A.png`: completed whole-content Natural Translation with settled status, toolbar, and tab chrome.
- `15ADE9C4-7FC7-479B-A7D1-8DC9972F0A2B.png`: selected `静か` region with its canonical gloss.
- `64E83901-E0A0-4CCB-8A24-3ED8BA447ACA.png`: canonical `静か` Word Detail with Photo Back and operable image-attachment context.
- `C28BC5F7-47F3-4B4E-BE69-1E5E8E83CF47.png`: page-local No Text Found alert and public OK recovery.
- `83FF4398-A264-4529-841A-9201AC597A5A.png`: noisy/low-contrast OCR with multiple selectable Japanese regions.
- `8E049656-8406-4201-BAA5-CD460B9A6C7D.png`: sparse single-kanji selection and gloss.
- `45CBF453-EA0C-4EB7-82A6-A6871B136C7C.png`: cold relaunch at the empty Search root, proving the image session is transient.
- `676CC54C-80CD-4CAF-B19B-93882FA99491.png`: vertical layout with the left-column `読` selection resolving the cross-observation `読本` region.

## Fixture authority and privacy

The five privacy-safe dossier fixtures are copied byte-for-byte into Debug builds only. Their authoritative SHA-256 values are:

- `IMG-FIXTURE-001` clear horizontal: `f7eaa0d29ea9074aebada7e06c6d43de0a8f3e6ac62570e706c1d71c1f3eabf4`
- `IMG-FIXTURE-002` vertical: `ff2a1f79d147f15d787bc2216f9932f3e6e1989f0350536d983942746ab97882`
- `IMG-FIXTURE-003` sparse: `9dd00bca62095b2058dbe05caa5a327103d1ababbcbdd7ed6a0535f53f2e092b`
- `IMG-FIXTURE-004` noisy horizontal: `a66f0d6140d0c0a3c66352516b6581e5325e6275f605ef6ad58ba6f6998281b8`
- `IMG-FIXTURE-005` empty: `a39925808f8783e82e7702df843c1ec65f80d1534181fd5483867b35f9b33d0b`

The fixtures are purpose-created and contain no personal data. User-selected image bytes belong only to the active in-memory session and are discarded on Close or relaunch; Image Text creates no durable output.

## Named differences and boundaries

- `ENVIRONMENT-DIFFERENCE-001`: verification uses simulator iOS 26.0.1; the fixed reference authority is physical iPhone 17 Pro Max on iOS 26.5.2.
- `OCR-SUBSTITUTE-001`: production uses Apple Vision, an approved platform substitute. Debug-only deterministic observations cover sparse, vertical, and unlinked-Japanese geometry at the composition root; production remains on live Vision.
- `COPY-TEXT-DIFFERENCE-001`: Copy Text preserves the recognizer's five raw lines in order. Apple Vision's current casing and spacing for `platform` and fixture metadata differ from Nihongo's recorded serialization; Zenbu does not apply a fixture-shaped text rewrite.
- `NATURAL-TRANSLATION-ADDITION-001`: whole-content Natural Translation is a Zenbu product addition. Production explicitly requests installed Apple Translation from Japanese to English. The deterministic Debug translation proves the public state only; download availability, output quality, routing, interruption, and provider failure remain uncaptured.
- `IMAGE-SOURCE-EXCLUSION-001`: Camera and Photo Library mechanics are excluded. Their visible controls explain the Files boundary rather than pretending to work.
- `IMAGE-FAILURE-BOUNDARY-001`: invalid-file/provider failures, unusual orientation/grouping, rapid navigation, and interruption do not have exact reference parity; Zenbu presents app-owned errors where exposed.
- `SHARE-SHEET-BOUNDARY-001`: the app-owned Share Image action is verified through presentation of the system activity sheet; destinations and third-party activity behavior are outside this journey.
- `ASSET-SUBSTITUTE-001`: controls use SF Symbols and app-owned SwiftUI styling under the approved asset variance.
