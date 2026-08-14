# Issue 151 manual QA checklist

This is the manual companion for the automated `ExampleSentenceRetrievalPolicy/v1`
checks. It is prepared for issue #152 and final human-in-the-loop review; none of
the boxes below are implementation evidence until a reviewer records the fixed
commit, build, device, OS build, date, and result.

Do not use the sealed #147 holdout during this checklist. Do not submit, upload,
or release a build. Use the USB-connected iPhone 14 Pro Max for Zenbu testing;
the iPhone 17 reference device is outside this QA scope.

## Preconditions

- [ ] Record the exact Git commit and confirm the worktree is clean.
- [ ] Run the bundled-database validator and frozen v1 fixture replay.
- [ ] Run the complete Debug simulator test suite and a Release simulator build.
- [ ] Build and install the same commit on the USB iPhone 14 Pro Max.
- [ ] Record the device model, iOS build, `sqlite3_libversion()`, app version, and build number.
- [ ] Enable Airplane Mode before the retrieval checks; examples must remain available offline.

## Direct English retrieval

- [ ] Search `scared you`. The Search result offers exactly 5 Example Sentences.
- [ ] Open the list. `He was scared you would shoot him.` is first, followed by
      `If I wanted to scare you...`, the two `Sorry... scare you.` rows, and
      `I'm sorry. I didn't mean to scare you.`
- [ ] Search `scare you`. The same five pairs appear, but the four exact `scare
      you` rows rank before `He was scared you would shoot him.`
- [ ] Search `startled you`. No Example Sentences control appears.
- [ ] Search `red you`. No substring-leak Example Sentences control appears.
- [ ] Search `cat`, then `cat!`. Both show `View 50+ Example Sentences`, and the
      visible ordering is identical.
- [ ] Search `scatter` and verify exactly 21 Example Sentences; search `neat` and
      verify exactly 19.
- [ ] Search `eat`, `great`, and `education`; each shows the 50+ count without
      duplicate visible rows or order changes after leaving and reopening.
- [ ] Enter a query containing an ASCII double quote. Retrieval fails without a
      crash, unintended result substitution, or literal-substring fallback.

## Separate Japanese and dictionary-entry routes

- [ ] Search `ねこ`. Exactly 10 direct Japanese matches appear, ordered
      consistently after reopening the list.
- [ ] Search `食べる`. The direct Japanese route shows 50+ and does not depend on
      the English index.
- [ ] Open the canonical `食べる` Word Detail and its inline/dedicated examples.
      Every row contains selected written-form, alternate-form, or reading
      evidence for that exact app-owned entry.
- [ ] Open an ambiguous same-written-form/same-reading entry. It receives no
      unverifiable examples and does not silently substitute direct-search rows.

## Existing learner journeys

- [ ] From a populated Example Sentences list, tap Japanese tokens and verify
      canonical Word Detail navigation and every Back transition.
- [ ] Tap speech on the first, middle, and last visible rows; each speaks that
      row's Japanese and does not reorder or reload the list.
- [ ] Scroll to the final returned row and verify it clears the bottom navigation.
- [ ] Background and foreground the app, then reopen the same query; order and
      count remain unchanged.
- [ ] Force-quit and cold-launch in Airplane Mode. Retrieval remains available,
      with no first-launch index build or writable database copy.

## Failure and acceptance boundary

- [ ] Run the automated base-only fixture: English returns typed
      `retrievalUnavailable`, while valid Japanese retrieval still succeeds.
- [ ] Confirm missing/mismatched metadata, incomplete mappings, and corrupt
      artifacts fail the release validator.
- [ ] Attach screenshots/logs only to the designated QA issue; do not commit
      device identifiers, private reference screenshots, or sealed holdout data.
- [ ] Record pass/fail and every discrepancy in #152. A pass authorizes only the
      later independent HIL decision; it does not authorize shipping.
