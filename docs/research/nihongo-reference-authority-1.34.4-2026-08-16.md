# Nihongo 1.34.4 reference-authority replay

Issue: [#168](https://github.com/serpcompany/zenbujapanese-monorepo/issues/168)  
Reference: genuine App Store Nihongo `com.serpentisei.studyjapanese` 1.34.4  
Candidate: Zenbu Release build from `7a9fde4a48aedbdb1ed6fcd113a13aac6b1358ae`

## Result

The bounded replay found **no changed disclosed anchor in 10/10 contexts**
between the historical Nihongo 1.34.3 record and Nihongo 1.34.4. The stale
version did not explain the known retrieval and entry-route discrepancies.

The current Zenbu candidate passed 2/10 observed boundaries and mismatched
8/10. Direct example leaders still diverge for RH01, RH02, RH03, and RH06.
RH08 retains the same five-row set but differs at rank 2. The corrected
dictionary comparator now selects the same primary entries for RH04, RH05,
RH09, and RH10, but RH04 has no source-matched entry examples and RH09/RH10
diverge at the first example. RH05 matches at the primary-entry and first-row
boundary; its complete downstream top-20 sequence was not replayed.

The machine-readable result is
[`fixtures/nihongo-1.34.4-reference-replay-issue-168.json`](fixtures/nihongo-1.34.4-reference-replay-issue-168.json).

## Custody and sequence

The single iPhone 14 Pro Max was inventoried with `devicectl ...
--include-all-apps`. The executable preflight passed with exactly one genuine
Nihongo 1.34.4 app, one Zenbu app, the exact candidate source/artifact, and no
booted simulator.

Nihongo was launched by exact bundle identifier. All ten reference anchors
were captured before Zenbu was opened. Fifteen private reference PNGs and the
private reference manifest were frozen at SHA-256
`df09f5e9bbc2f289ab07569f06d758c4cb953f390f93e082c4ae2495abb4c4ca`.
The exact candidate was then rebuilt, development-signed with existing local
assets, installed on the same phone, and launched by exact bundle identifier.
Fifteen private candidate PNGs and the comparison manifest were frozen at
SHA-256 `e9591abf9241a43080fee1844d962d752f3219dae5fb00d28bd1418a81858808`.

Private screenshots, device identifiers, and full private sequences remain
outside Git. The public matrix contains only the already-retired context IDs,
result classes, blocker mapping, and evidence hashes.

## Limit

This replay restores current-version authority only for the disclosed anchor
of each retired context: count class, primary entry, first row, and RH08's
exact five-row order. It does not claim that every deeper row in the historical
50+ or top-20 lists is unchanged. Those complete sequences remain subject to
the replacement validation required by #162.

No query-specific exception, Ranking change, Retrieval change, merge,
TestFlight upload, App Store Connect mutation, or release occurred.
