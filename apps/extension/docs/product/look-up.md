# Look Up

Look Up is the side panel's first tab ([`side-panel.md`](side-panel.md)): a search over the
dictionary on this computer, as the app's Look Up. The search is the shared dictionary core's, the
one the app and zenbujapanese.com use, so a word is found from its kanji, its kana, its romaji, or
its English (食べる, たべる, taberu, or "to eat"; the core's own tests, in
`packages/dictionary-core/src/search/`, hold how it matches). The text is in
`src/look-up/labels.ts`. The tests named here are in `src/look-up/look-up-tab.interaction.test.tsx`
unless a path says otherwise; they draw the tab in happy-dom, with a results screen in the core's
shape for each search.

## What a learner sees

| Behavior | Check |
| --- | --- |
| A search box, "Look up Japanese or English", with Search at its right. Return or Search searches what is typed, without the spaces around it; an empty box searches nothing. Each search asks again, even for the same text. | "has a search box…", "searches the trimmed text…" |
| Each word found is a row, in the dictionary's order: the word with its reading over its kanji, its romaji, and its meaning in a line, as the reading aids are set ([`settings.md`](settings.md)). | "finds 食べる from…", "lists every row…" |
| A row opens the word's Word Detail over Look Up ([`word-detail.md`](word-detail.md)); Back finds the search as it was left. | "finds 食べる from…, and its row opens its word card"; `src/side-panel/panel.interaction.test.tsx`, "opens the word card from a Look Up result" |
| A search for a kanji shows its kanji row first, under "Discovered Words", and the row opens the kanji's page. | "shows a kanji row…" |
| A search the dictionary reads as romaji offers to search its Japanese reading, such as "Search for「たべる」", and the row searches it. | "searches the Japanese reading…" |
| Nothing found shows "No Dictionary Matches". | "says No Dictionary Matches…" |
| While the dictionary downloads, the search shows its progress; a search that failed shows why it couldn't, with Try again, which searches again. | "shows the download…", "offers Try again…" |

The panel asks the dictionary worker for the search by its text, and the worker answers with the
screen the core builds (`src/worker/answer.test.ts`, "answers a search with the screen the core
builds for it").

## Not built yet

A row doesn't show the word's frequency chips, and the core's "View N Example Sentences" row isn't
drawn. A result opens the word's page; it doesn't expand in place (#1124). No browser test searches:
the e2e dictionary has no search tables, so `e2e/side-panel-tabs.spec.ts` checks only the box.
