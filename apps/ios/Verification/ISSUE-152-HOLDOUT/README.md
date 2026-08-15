# Issue 152 sealed-holdout and device verification

Issue: [#152](https://github.com/serpcompany/zenbujapanese-monorepo/issues/152). Parent retrieval gate: [#147](https://github.com/serpcompany/zenbujapanese-monorepo/issues/147).

## Verdict

The frozen candidate `53af1853441c853368523b6039eb7077a37d858c` fails the sealed holdout: **1 pass, 9 mismatches, 0 skips**. Direct Search is 1/6 pass; dictionary-entry is 0/4 pass. No tuning, context replacement, release, upload, or App Store action occurred.

The nine mismatches are native blockers [#153](https://github.com/serpcompany/zenbujapanese-monorepo/issues/153) through [#161](https://github.com/serpcompany/zenbujapanese-monorepo/issues/161), excluding the passing RH07 context. Each is both a subissue and a `blocked_by` dependency of #152. [#162](https://github.com/serpcompany/zenbujapanese-monorepo/issues/162) owns the replacement sealed set and is blocked by all nine corrections.

## Blind protocol and evidence boundary

- The sealed manifest remained owner-only (`0700` directory, `0600` file) and matched SHA-256 `3fdfaa9f0c70c542ceb9c43e3a3cf1872ac5869b52f20ba1c9dd006a0d99b3b2` before opening.
- Nihongo 1.34.3 reference capture completed 10/10 before the candidate or corpus was observed.
- The reference freeze contains 58 private PNG captures and has SHA-256 `fd6468ecde53046454839354ca95eb6b6ed241ac2fb830cd2360fe94abb445c1`.
- The candidate result was exported from the passing hosted simulator test as JSON with SHA-256 `94a38c5694a389295c86f1e4a15c46355ff91c5afba8ddc17cae10dee6654254`.
- The private comparison record has SHA-256 `4b7d74109deb007800bf6dde2e6e3c56a34b54deba79e8f576b2d3adf967d293`.
- Screenshots, device identifiers, full private sequences, and private JSON remain outside Git. The committed [machine-readable matrix](../../../../docs/research/fixtures/example-sentence-retrieval-issue-152-holdout-matrix.json) retains only opaque/public IDs, counts, classifications, hashes, and `private://` pointers.

The ten inputs are now disclosed in their blocker issues and are permanently retired as blind validation. They may be used only as deterministic regression evidence.

## Context matrix

| ID | Language | Route | Reference count | Candidate count | Result | First divergence | Blocker |
|---|---|---|---:|---:|---|---|---|
| RH01 | English | direct Search | 50+ | 50+ | mismatch | rank 1 | #153 |
| RH02 | English | direct Search | 50+ | 50+ | mismatch | rank 1 | #154 |
| RH03 | English | direct Search | 50+ | 50+ | mismatch | rank 1 | #155 |
| RH04 | English | dictionary entry | top 20, no visible count | exact 34 for another entry | mismatch | entry selection | #156 |
| RH05 | English | dictionary entry | top 20, no visible count | exact 14 for another entry | mismatch | entry selection | #157 |
| RH06 | Japanese | direct Search | 50+ | 50+ | mismatch | rank 1 | #158 |
| RH07 | Japanese | direct Search | exact 0 | exact 0 | **pass** | none | — |
| RH08 | Japanese | direct Search | exact 5 | exact 5 | mismatch | rank 2 | #159 |
| RH09 | Japanese | dictionary entry | top 20, no visible count | 50+ | mismatch | rank 1 | #160 |
| RH10 | Japanese | dictionary entry | top 20, no visible count | 50+ for another entry | mismatch | entry selection | #161 |

## Other verification layers

These results do not offset the failed holdout; they establish that the fixed point is buildable and the frozen implementation executes on the supported runtime.

| Layer | Result |
|---|---|
| Source privacy/index/frozen-discovery audit | pass |
| Full iOS Simulator suite | 84 total / 83 passed / 0 failed / 1 expected physical-camera skip |
| Release Simulator build | pass |
| Unsigned arm64 Release archive and archive audit | pass; archive SHA-256 `15f1646d7ee08e292b1851d3a5a27b9d8f6c41d53aee50426d9e95857fc75c17` |
| USB iPhone 14 Pro Max hosted retrieval/runtime | 8/8 passed on iOS 26.6 with system SQLite 3.51.0 |
| USB physical UI smoke | 0/3 executed; automation mode timed out while the phone was locked/asleep |
| Sealed holdout | 10 evaluated / 1 passed / 9 mismatched / 0 skipped |

The remaining physical action is exact: unlock the USB iPhone 14 Pro Max and leave it awake on the Home Screen. Never select or install Zenbu on the paired iPhone 17; that phone is reference-only.

## Devin manual HIL checklist

This checklist reproduces the frozen blockers; it is not release approval. Use only a build from the exact candidate commit on the USB iPhone 14 Pro Max.

1. In Xcode, confirm the run destination is the USB iPhone 14 Pro Max, not the iPhone 17. Install and launch Zenbu without changing corpus or policy files.
2. For a direct Search context, type the exact input below, open **View Example Sentences**, and compare the visible order. For a dictionary-entry context, type the input, open the first **Best Match**, scroll to **Examples**, and compare that route separately.
3. Record a pass only when count class, selected entry, and every visible row through the frozen cap match. Stop at the first mismatch and attach a screenshot to its blocker.

| ID | Exact input | Expected first observable reference result |
|---|---|---|
| RH01 | `book` | rank 1: `食事中本を読んだ。` / “I read a book while eating.”; 50+ |
| RH02 | `notebook` | rank 1: `私はノートがほしい。` / “I want a notebook.”; 50+ |
| RH03 | `looked after` | rank 1: `彼女は赤ん坊の世話をした。` / “She looked after her baby.”; 50+ |
| RH04 | `set` | first Best Match `セット` (`セット`), then its inline Examples |
| RH05 | `light` | first Best Match `光` (`ひかり`), then its inline Examples |
| RH06 | `飲んだ` | rank 1: `彼は少し飲んだ。` / “He drank a little.”; 50+ |
| RH07 | `読ませた` | no Example Sentences action; exact 0 |
| RH08 | `お待たせしました` | exact 5; ranks 1–5 are the five rows recorded in `private://issue-152/reference-captures/RH08-02.png` |
| RH09 | `始める` | first Best Match `始める` (`はじめる`); example rank 1 `始め！` / “Begin!” |
| RH10 | `はし` | first Best Match `端` (`はし`), then its inline Examples |

4. Separately verify Search return navigation, Example Sentence token traversal, speech, dictionary-entry back navigation, Settings support/privacy links, and ordinary permission behavior.
5. With a real Japanese text fixture visible to the camera, verify camera permission and capture starts Image Text Flow. Do not photograph personal data.
6. Mark HIL **blocked**, not passed, while any of #153–#161 is open. Do not upload, submit, release, or touch App Store Connect.

## Replacement blind-validation requirement

[#162](https://github.com/serpcompany/zenbujapanese-monorepo/issues/162) requires that, after all nine blockers are corrected and a new candidate plus retrieval contract are frozen, an independent custodian create a new sealed validation set and publish only its commitment/count/coverage before observing Nihongo or Zenbu. The new set must be distinct from RH01–RH10 and all #147 discovery probes. No replacement context is selected in this change.
