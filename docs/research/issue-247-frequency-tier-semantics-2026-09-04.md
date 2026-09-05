# Issue #247: Migaku frequency-tier semantics and provider-neutral fallback

Date: 2026-09-04

Issue: [#247](https://github.com/serpcompany/zenbujapanese-monorepo/issues/247)

Status: research evidence; tier proposal rejected by owner

## Conclusion

Migaku's public first-party evidence verifies the direction and exact implementation of the **legacy 2021 Migaku Dictionary Add-on**, not the thresholds of the current Migaku product:

- more stars meant a better (lower) position in the active ordered frequency list;
- five stars were the most frequent rated band and one star was the least frequent rated band;
- an entry beyond the rated cutoff, and an entry absent from the list, displayed no stars rather than one star.

The exact current Migaku thresholds could not be verified from a current Migaku-owned public page, repository, or changelog. Current first-party materials establish that stars and a precise numeric ranking are alternate frequency-tag styles, and that frequency is list/corpus dependent. They do not publish the current star-to-rank function. Therefore issue #247 must not call a Zenbu policy “Migaku's tiers” or claim current threshold parity without owner-observed current-product evidence or a Migaku-owned specification.

After reviewing this evidence, the owner rejected a derived 1–5 tier system. The approved Zenbu design shows the active Frequency Pack's exact rank, such as `#41`, and uses `—` when that pack has no mapped evidence. This preserves the source-backed number without inventing thresholds or implying parity with Migaku.

## Exact first-party legacy behavior

Migaku's public `migaku-official/Migaku-Dictionary-Addon` repository identifies the project as the Migaku Dictionary Add-on and its tip commit is dated 2021-07-02. At pinned commit `0bc88ae46fbdc1df4d23752b3056cb25a2fd3ca0`:

1. `getFrequencyList` enumerates the imported ordered frequency-list array and assigns each item its **zero-based array index** (`idx`) as `frequency`.
2. `getStarCount` maps that index using the following strict upper bounds.
3. A missing entry is assigned a sentinel/blank star value. A present entry at index `60001` or later also receives an empty star string.

Source: [Migaku-owned pinned implementation, frequency import and star mapping](https://github.com/migaku-official/Migaku-Dictionary-Addon/blob/0bc88ae46fbdc1df4d23752b3056cb25a2fd3ca0/src/dictionaryManager.py#L594-L648); [repository](https://github.com/migaku-official/Migaku-Dictionary-Addon/tree/0bc88ae46fbdc1df4d23752b3056cb25a2fd3ca0).

| Stored zero-based list index | Literal ordinal position implied by the importer | Legacy display |
| ---: | ---: | ---: |
| `0...1500` | 1st through 1,501st | 5 stars |
| `1501...5000` | 1,502nd through 5,001st | 4 stars |
| `5001...15000` | 5,002nd through 15,001st | 3 stars |
| `15001...30000` | 15,002nd through 30,001st | 2 stars |
| `30001...60000` | 30,002nd through 60,001st | 1 star |
| `>= 60001` | 60,002nd or later | no stars |

The unusual one-row offsets above are not a transcription error: they follow from zero-based enumeration combined with comparisons such as `frequency < 1501`. It is plausible that Migaku intended the friendlier rank bands 1–1,500, 1,501–5,000, 5,001–15,000, 15,001–30,000, and 30,001–60,000, but no first-party prose establishing that intent was found. The code's literal behavior is the only exact threshold claim supported here.

This also establishes an important semantic distinction for Zenbu: **one star did not mean “all remaining rare words.”** Legacy Migaku stopped rating after its cutoff, and its UI did not distinguish an out-of-band ranked row from missing frequency evidence by star count alone.

## What current Migaku public evidence does and does not establish

Migaku's current changelog says that, beginning in July 2025, dictionary settings can show frequency tags as either stars or a “precise number ranking.” In November 2025 it made precise numbers the default. This establishes that the current product still treats the star display as a coarsening of rank, but the changelog publishes no band boundaries: [Migaku changelog](https://migaku.com/blog/changelog).

Migaku's current frequency article gives concrete lower-is-more-frequent examples: `俺` is described as 10th on Netflix, 2,522nd on Wikipedia, and outside a newspaper's top 10,000. It emphasizes that frequency changes with medium/genre and recommends the top 1,500 and top 5,000 as learner milestones: [Migaku frequency approach](https://migaku.com/blog/japanese/how-to-learn-japanese-vocabulary). Migaku's settings guide likewise says multiple frequency lists exist because a word can be more or less common in different genres: [Migaku settings guide](https://migaku.com/blog/youtube/the-settings-migaku-browser-extension).

Together with the legacy implementation, the strongest defensible reading is:

- lower exact rank means more frequent in the selected list;
- historically, more stars meant more frequent;
- frequency is corpus/list-relative, not a universal property of a dictionary entry.

However, the **current five-band boundaries, current treatment of the long tail, tie behavior, and any difference by language/list remain unverified**. Public third-party repositories repeat approximate boundaries, but they are not authoritative evidence of current Migaku behavior and were not used to elevate this conclusion.

## Fit with Zenbu's active packs

The active-pack evidence established in [issue #212 research](issue-212-frequency-pack-contract-2026-09-02.md) is suitable for an app-owned policy but not for claiming Migaku parity:

- TUBELEX's official documentation describes ordered, reproducible frequency lists with occurrence and video/channel-dispersion measures, plus Japanese UniDic 3.1 lemma/POS variants. The selected list has 351,453 rankable word rows: [TUBELEX source and formats](https://github.com/naist-nlp/tubelex/tree/7cb5fb36add76b83a266d1967536e1a1d3faa513).
- The optional Wikipedia source has 560,821 Japanese UniDic 3.1 NFKC word types, 609,365,356 tokens, and 2,177,257 articles. Its source says rows are sorted by occurrence count, words appearing in fewer than three articles are excluded, and `[TOTAL]` is not a word row: [Wikipedia frequency source and format](https://github.com/adno/wikipedia-word-frequency-clean/tree/8b7a28118736ef4bc9b70ebb4abc33d32b53200c).

Applying the legacy absolute 60,000-position cutoff directly would discard tier presentation for roughly 83% of TUBELEX rows and 89% of Wikipedia rows even though those rows contain frequency evidence. Treating all such rows as Tier 1 would also depart from legacy Migaku, where they were blank. Either choice would silently conflate a product policy with Migaku behavior.

## Investigated provider-neutral tier policy (rejected)

The research briefly considered converting each pack's one-based rank and covered-row count into five percentile bands. That would have required Zenbu to choose and version thresholds that neither source supplies and that current Migaku does not publish. Fixed legacy cutoffs would also exclude most ranked TUBELEX and Wikipedia rows, while normalized or equal-width bands would be new Zenbu inventions.

The owner rejected every tier variant. No proposed tier identifier, cutoff, formula, direction, or label is approved product policy, and none should appear in production code or tests. This section is retained only to explain why exact source-backed rank is the safer outcome.

## Owner decision

The owner chose exact active-pack rank instead of tiering:

- Search rows show the exact rank already provided by the app-owned Frequency capability, formatted consistently with Word Detail.
- Rows with no mapped evidence show `—`; missing evidence is never assigned to a lowest tier or fabricated tail rank.
- Provider identity and methodology remain in Frequency details and management rather than being repeated on each Search row.
- Switching the active pack changes the exact displayed rank without changing Dictionary Match, Dictionary Ranking, result grouping, or navigation.

No 1–5 policy, fixed threshold, percentile band, star display, or Migaku parity claim is part of the approved implementation.

## Audit boundary

This research inspected public Migaku-owned pages and the legally public, Migaku-owned open-source add-on at a pinned commit. It did not download a proprietary Migaku frequency list, inspect current extension/application bundles, bypass access controls, scrape a service, or copy Migaku data/assets into Zenbu. It also read issue #247, the repo domain vocabulary, and the existing issue #212 frequency-pack research. Findings about absence are limited to publicly reachable material checked on 2026-09-04.
