# Radical input

The search box's radical input, as the app's Look Up offers it: a learner finds a kanji by picking
the radicals it holds. It is in every search box: on the homepage, the dictionary home, the search
page, and each results page. Handwriting, the app's other input, isn't built yet ([Required, not
built yet](not-built-yet.md)). The abbreviations are [Dictionary](dictionary.md)'s; **App docs** is
`apps/ios/docs/product/dictionary.md`, and Swift files are in
`apps/ios/Modules/Sources/SearchExperience/`.

**The panel.** The box's grid button, Radicals, opens the app's radical panel over the page (a
dialog, or a drawer on a phone), so nothing on the page moves or draws again. Its strip lists the
kanji holding every radical picked, fewest other radicals first, or says "Select one or more
radicals"; below it, the radicals sit under stroke-count headings ("3 Strokes"), each a section that
opens and closes, which the browser remembers. A radical that no kanji holds with those picked is
hidden. Pressing a radical again unpicks it, and Undo removes the last one picked. The panel credits
RADKFILE, with its links, as EDRDG's licence asks of a page showing its data. In Japanese, the
headings and the panel's words are Japanese ("3画").

- Source: App docs, Search (Handwriting and Radicals); `RadicalInputView.swift`, which draws the
  core's `RadicalLookup` (`packages/dictionary-core/src/search/radicals.ts`); the owner's decision
  of 2026-10-26 on #832 (build radical input now, in the site's current look; Devin designs it
  later).
- Check: `src/components/dictionary/radical-input.interaction.test.tsx` (the radicals by stroke
  count, the strip, hidden radicals, Undo, the closed headings kept, the credit, Japanese, and a
  failed load); `apps/web/e2e/radical-input.spec.ts`, "the search box’s Radicals finds a kanji by
  its radicals and searches it for its leading words"; that the panel is the app's on the app's
  data: `apps/dictionary-api/src/conformance/radical-input.test.ts`, "the website’s panel, from the
  service’s radicals, is the app’s for every radical and a pair with each"; the core's
  `search/radicals.test.ts`; at a phone's width and in both themes, the Radicals panel view of
  Search results in `apps/web/e2e/page-types.ts`.

**Nothing moves.** Opening the panel moves nothing on the page, and draws no result again: the
results keep their places and their elements, and the page asks for nothing but the radicals.

- Source: the owner's decision of 2026-10-26 on #832 (no layout shift or second paint).
- Check: `apps/web/e2e/radical-input.spec.ts`, "opening the panel moves nothing on the page and
  draws no result again", at both widths.

**Where the radicals come from.** The panel's radicals and kanji are the app's
`RadicalReferenceData.json` (KRADFILE and RADKFILE), which the dictionary service answers at
`/v1/radicals`, and the website at `/dictionary/radicals.json` (an hour in the browser's cache,
`noindex`). The page reads it, and the panel's code, when the learner first points at, focuses, or
presses the button, and works the panel out in the browser with the core, as the app does on the
device. Until then the panel says "Loading radicals…", and when the radicals can't load, "Radical
data unavailable" with Try again.

- Source: ADR 0009 (the website reads the dictionary only through the service).
- Check: `src/app/[locale]/dictionary/radicals.json/route.test.ts`;
  `src/lib/dictionary/data.test.ts`, "reads the radical panel’s file from the service, or the
  fixtures without one"; the service's
  `apps/dictionary-api/src/app.test.ts`, "answers the radical file the panel reads, under the
  contract", and `load.test.ts`, which refuses a radical file the pinned release doesn't name.

**Picking a kanji.** A kanji joins the end of the query in the box, as the app adds a candidate,
and opens that search; the panel closes, and opens again with nothing picked. On a Japanese page the
search is the Japanese one. That search, the box's text with the kanji, goes into a subscriber's
Recent searches, as the app records a picked kanji ([What an account syncs](synced-data.md)).

- Source: App docs, Search ("A candidate from any panel is added to the end of the query");
  `SearchInputCandidate.accept` in `SearchInputPanel.swift`.
- Check: `src/components/dictionary/radical-input.interaction.test.tsx`, "a kanji is added to the
  end of the query, searched as picked, and the panel closes" and "a pick is a search the learner
  asked for, kept for a signed-in learner's Recent searches"; `apps/web/e2e/radical-input.spec.ts`,
  that test and "a kanji picked on a Japanese page joins the query and opens its Japanese search".

**Radical searches keep the strongest matches.** A one-kanji search picked from the panel lists
only its leading group of equally strong matches, as the app limits a Radicals or Grade pick, with
the typed search's kanji row and Example Sentences row. Its address adds `?input=radicals`; its
title, description, canonical, and indexing are the typed search's, so it is no page of its own to
a search engine, and the address is followed only from the panel. A query of more than one
character lists every word, as typed. Typing in the box again searches as typed.

- Source: `pickedKanjiQuery` in `SearchView.swift`; the core's `resultsLayout`, which the app's
  results screen runs, and `searchResultsScreen`, which the service answers the website with.
- Check: `packages/dictionary-core/src/results/results.test.ts`, "lists only the leading entries of
  a kanji picked from the radicals, re-sorted, with its kanji row";
  `apps/dictionary-api/src/conformance/radical-input.test.ts`, "a picked 日 lists only its leading
  words, as the app lists them" (and 見, 上, 要, and 腰), against the app's own path, and "a picked
  word of more than one kanji lists every word, as typed";
  `src/app/[locale]/dictionary/search/[query]/page.test.ts`, "lists a picked kanji’s leading words,
  with its kanji row, as the app does" and "has the typed search’s title, description, canonical,
  and indexing"; `apps/web/e2e/radical-input.spec.ts`, the pick of 要.
