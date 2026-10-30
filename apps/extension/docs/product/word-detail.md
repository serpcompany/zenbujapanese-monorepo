# Word Detail

Word Detail is one dictionary word's full entry, as the app's Word Detail
([`dictionary.md`](../../../ios/docs/product/dictionary.md)) with its Status, Lists, and Notes,
but no Add Photo or Look Up, and a kanji's page saves nothing. It opens inside the word popup, when Open Full
Entry expands the card in place ([`word-popup.md`](word-popup.md), Its actions), on a page and,
where the page can't show a card, in the side panel. Two more pages open from it: a kanji's
detail and the examples for one conjugated form. Each page draws only its content; the full entry
(`src/word-detail/full-entry.tsx`) draws a row of Back over it and keeps the pages opened inside
it. The side panel has no Word Detail pages of its own: nothing in it opens one.

Every check below is in `src/word-detail/` unless it names another file, in happy-dom, on the dictionary core's fixtures
answered through a fixture source in the test, with Back drawn by the full entry: `word-detail-page.interaction.test.tsx` (word) and
`kanji-and-form-pages.interaction.test.tsx` (kanji and form); popup is
`src/word-popup/word-popup.interaction.test.tsx`. A check marked Chrome is a
browser test in `e2e/word-popup.spec.ts`, in the expanded word popup on a page, with the fixture
release.

## The word

| Behavior | Check |
| --- | --- |
| The top: the headword with furigana, at `@zenbu/ui`'s panel size (`headwordSize="panel"`, `text-4xl`; the website keeps `text-5xl`), so a long headword such as テーブル fits the card at 380 px, pitch with its speaker or a Pronounce button, which speak in the word popup's voice ([`word-popup.md`](word-popup.md), Its actions), and the part of speech. Then Meaning, Frequency, Alternatives, Kanji, Alternative Kanji, and Related Words, each only when the word has it, Lists and Notes always, and Examples. 要る shows Meaning, Frequency, Kanji, Lists, Notes, and Examples. | word: 要る's top and sections; `packages/ui/src/dictionary/word-header.test.tsx`, "draws the headword at the website's size unless asked for the panel's"; popup: "expands in place into the word's full entry…" (`text-4xl`); `e2e/word-header.spec.ts`: "draws テーブル, read テーブル, on one line…" and "draws 食べる, read たべる, on one line…" |
| Reading Aids follow Settings: with Furigana off, the furigana goes and the reading shows under the headword. | word: Furigana off |
| Frequency lists the learner's chosen dictionaries in their chosen order (`frequencyDictionaries.chosen`, JLPT among them), and leaves the section out when none has the word. | word: Frequency follows the chosen dictionaries |
| A word with several entries, such as 要, shows each entry's reading as a tab, starting on the one that was chosen. | word: 要's two entries |
| The part of speech opens the conjugation table in a sheet. A form in it opens that form's examples. | word: the conjugation table |
| Each meaning has a menu: Speak reads it in the best US English voice on this computer, or another English one when it has none, chosen as Pronounce chooses a Japanese one, at the same rate, or says "This browser can’t speak English." when the computer has only online ones or Chrome lists none, and Copy puts it on the clipboard and says "Meaning copied". | word: a meaning's Speak; a meaning's Copy |
| A page's notices, such as "Meaning copied", "Link copied", a browser that can't speak, or a related word not found, go to the card that holds it, which shows them in a line at its foot, under the entry, where they're seen however far the entry is scrolled. The line is an `output`, which a screen reader reads out. | word: a meaning's Copy; Share without a share sheet; a meaning's Speak in a browser that can't speak; a related word with no target; `src/word-popup/word-popup.interaction.test.tsx`: "shows Word Detail's own header actions in the expanded card…, and its notices at the card's foot" |
| Share sends the word's zenbujapanese.com page to the system's share sheet. Without a share sheet, Share copies the link and says "Link copied". ••• has no Copy Link. | word: Share gives the word's page…, and ••• has no Copy Link; Share without a share sheet |
| Open on zenbujapanese.com, an icon button beside Share with Share's size and look, opens the word's zenbujapanese.com page, the address Share gives, in a new tab; the card stays open on the word. Its label is its accessible name and its tooltip. The extension has no dictionary search, so this is how a learner goes on to the website. | word: Open on zenbujapanese.com opens the word's page in a new tab; Chrome: "the expanded card's Open on zenbujapanese.com opens the word's page in a new tab and keeps the card" |
| Examples show 25 sentences; Load more examples fetches the next 25. When that fails, the button says Try again, and Try again fetches them. | word: Load More; Load More that fails |
| A linked word in a sentence, a kanji, an alternative kanji, or a related word opens its own page. A Kanji or Alternative Kanji row opens the kanji's page (on the website, a row with no details stays plain text). | word: an example's word; full entry: Back returns through the pages; いる's Alternative Kanji row |
| Back returns to each page as it was left: the full entry keeps it drawn, so it isn't asked again. Focus goes to the entry of the page shown, which the arrow and Page keys scroll; Back is before it in the tab order. The last Back leaves the full entry, folding it back into the card. | full entry: "Back returns through the pages each link opened, each as it was left, then leaves" |
| A related word the dictionary doesn't have opens a page that says "This word isn’t in the dictionary." | word: いる's related word 有る |
| A related word given only by its spelling is looked up by it first: it opens the word that matches, says "有る isn’t in the dictionary." when nothing does, and "The dictionary couldn’t answer. Try again." when the lookup fails. | word: a related word with no target; its spelling resolves; can't resolve |

## Saving

The checks are in `src/word-saving/word-saving.interaction.test.tsx` (saving), in the expanded
word popup, against a stand-in for the service worker.

| Behavior | Check |
| --- | --- |
| ••• is the word popup's menu ([`word-popup.md`](word-popup.md), Its actions): Status, Add to List…, and Add Note, with the same toasts when saving is refused. | word: Share gives the word's page…, and ••• has no Copy Link; saving: "shows the ◐ Learning and ✓ Known tags…" |
| A Learning word shows ◐ Learning, and a Known word ✓ Known, under its headword; an Unknown word shows neither. They follow Status at once, here and on the card. | saving: "shows the ◐ Learning and ✓ Known tags, the lists that hold the word, and its own ••• follows the state" |
| Lists shows the lists that hold the word, or "No list holds it yet." | saving: the same |
| Notes shows the word's note in a field, or an empty one. Typing saves a second after it stops and when the field is left; emptying the field deletes the note. Add Note focuses it. | saving: "Add Note expands the card with the note focused; a note saves after a pause and on blur, and an empty one goes" |

## The kanji and the form

| Behavior | Check |
| --- | --- |
| A kanji's page shows its readings, meanings, sections, and stroke order, and its words open their own pages. It has no Lists or Notes yet. | kanji: 要's details |
| While the stroke order is still downloading, the page says so and shows the rest. It asks again each time the dictionary's data changes, and every second while the data is ready but the strokes are not, and shows the stroke order once it has downloaded. It stops asking once the data has failed or its update has, since the strokes won't arrive until the next try. | kanji: downloading; asks again when the data changes; a kanji page opened while the strokes download; stops asking when the update failed, and when the data failed (`strokes-arrive.interaction.test.tsx`) |
| A form's page shows the form with a Pronounce button and the sentences that use it, 25 at a time, or "No example sentences use this form yet." | form: いる; a form none uses |

## While the dictionary can't answer

| Behavior | Check |
| --- | --- |
| Before the dictionary's data is ready, a page shows its progress instead. Each word, kanji, and form page asks again each time the data changes, so the progress moves, and shows its answer once the data is ready. | kanji: not ready; moves its progress; form: asks again; word: waiting for the dictionary |
| When the dictionary fails, a page says "The dictionary couldn’t answer. Try again." with Try again. | kanji: Try again |
| A word or kanji the dictionary doesn't have says it isn't in the dictionary. | kanji: outside the dictionary |

## Not built yet

A kanji's page and a form's page have no link to the website; only a word's has. A kanji's page
has no Status, Lists, or Notes (#962).

Checks in Chrome on the whole dictionary (食べる, 食, and で) wait for the extension's final check
in Chrome.

A form's page shows the form alone, with no explanation and no furigana, because its route
carries only the form. The app's and the website's form headline follows Reading Aids
([`dictionary.md`](../../../web/docs/product/dictionary.md), a form's headline); this one waits
for a route that carries the form's word and kind.

A meaning's Speak reads the whole display meaning, a gloss's note in brackets included,
because the word rows carry no glosses. The app's Speak reads the sense's glosses; that waits for
#1077, which adds them to the dictionary service's word answer.
