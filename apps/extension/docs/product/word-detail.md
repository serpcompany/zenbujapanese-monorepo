# Word Detail

Word Detail is the side panel's page for one dictionary word, as the app's Word Detail
([`dictionary.md`](../../../ios/docs/product/dictionary.md)) without its saving: there are no
Lists, Notes, Mark as Known, Add Photo, or Look Up. Two more pages open from it: a kanji's detail
and the examples for one conjugated form. Each page draws only its content; the side panel draws
Back over it and opens a page from a route ([`side-panel.md`](side-panel.md)). The word popup's
Open Full Entry opens a word's ([`word-popup.md`](word-popup.md)).

Every check below is in `src/word-detail/`, in happy-dom, on the dictionary core's fixtures
answered through a fixture source in the test, with Back drawn by the side panel itself: `word-detail-page.interaction.test.tsx` (word) and
`kanji-and-form-pages.interaction.test.tsx` (kanji and form).

## The word

| Behavior | Check |
| --- | --- |
| The top: the headword with furigana, pitch with its speaker or a Pronounce button, which speak in the word popup's voice ([`word-popup.md`](word-popup.md), Its actions), and the part of speech. Then Meaning, Frequency, Alternatives, Kanji, Alternative Kanji, Related Words, and Examples, each only when the word has it. 要る shows Meaning, Frequency, Kanji, and Examples. | word: 要る's top and sections |
| Reading Aids follow Settings: with Furigana off, the furigana goes and the reading shows under the headword. | word: Furigana off |
| Frequency lists the learner's chosen dictionaries in their chosen order (`frequencyDictionaries.chosen`, JLPT among them), and leaves the section out when none has the word. | word: Frequency follows the chosen dictionaries |
| A word with several entries, such as 要, shows each entry's reading as a tab, starting on the one that was chosen. | word: 要's two entries |
| The part of speech opens the conjugation table in a sheet. A form in it opens that form's examples. | word: the conjugation table |
| Each meaning has a menu: Speak reads it in the best US English voice on this computer, or another English one when it has none, chosen as Pronounce chooses a Japanese one, at the same rate, or says "This browser can’t speak English." when the computer has only online ones or Chrome lists none, and Copy puts it on the clipboard and says "Meaning copied". | word: a meaning's Speak; a meaning's Copy |
| A page's notices, such as "Meaning copied", "Link copied", a browser that can't speak, or a related word not found, show as a toast over the side panel, where they're seen however far the page is scrolled. The toast is a live region. One Toaster, `@zenbu/ui`'s shadcn Sonner, sits in the side panel. | word: a meaning's Copy; Share without a share sheet; a browser that can't speak; a related word with no target |
| Share sends the word's zenbujapanese.com page to the system's share sheet; Copy Link, under •••, copies it. Without a share sheet, Share copies the link and says "Link copied". | word: Share and Copy Link; Share without a share sheet |
| Examples show 25 sentences; Load more examples fetches the next 25. When that fails, the button says Try again, and Try again fetches them. | word: Load More; Load More that fails |
| A linked word in a sentence, a kanji, an alternative kanji, or a related word opens its own page. A Kanji or Alternative Kanji row opens the kanji's page (on the website, a row with no details stays plain text). | word: an example's word; Back through the pages; いる's Alternative Kanji row |
| Back, in the side panel, returns to each page as it was left: the side panel keeps it drawn, so it isn't asked again. | word: Back through the pages |
| A related word the dictionary doesn't have opens a page that says "This word isn’t in the dictionary." | word: いる's related word 有る |
| A related word given only by its spelling is looked up by it first: it opens the word that matches, says "有る isn’t in the dictionary." when nothing does, and "The dictionary couldn’t answer. Try again." when the lookup fails. | word: a related word with no target; its spelling resolves; can't resolve |

## The kanji and the form

| Behavior | Check |
| --- | --- |
| A kanji's page shows its readings, meanings, sections, and stroke order, and its words open their own pages. | kanji: 要's details |
| While the stroke order is still downloading, the page says so and shows the rest. It asks again each time the dictionary's data changes, and every second while the data is ready but the strokes are not, and shows the stroke order once it has downloaded. It stops asking once the data has failed or its update has, since the strokes won't arrive until the next try. | kanji: downloading; asks again when the data changes; a kanji page opened while the strokes download; stops asking when the update failed, and when the data failed (`strokes-arrive.interaction.test.tsx`) |
| The side panel draws its word, kanji, and form pages with these three. | kanji: the side panel's pages |
| A form's page shows the form with a Pronounce button and the sentences that use it, 25 at a time, or "No example sentences use this form yet." | form: いる; a form none uses |

## While the dictionary can't answer

| Behavior | Check |
| --- | --- |
| Before the dictionary's data is ready, a page shows its progress instead. Each word, kanji, and form page asks again each time the data changes, so the progress moves, and shows its answer once the data is ready. | kanji: not ready; moves its progress; form: asks again; word: waiting for the dictionary |
| When the dictionary fails, a page says "The dictionary couldn’t answer. Try again." with Try again. | kanji: Try again |
| A word or kanji the dictionary doesn't have says it isn't in the dictionary. | kanji: outside the dictionary |

## Not built yet

Checks in Chrome on the whole dictionary (食べる, 食, and で) wait for the extension's final check
in Chrome.

A form's page shows the form alone, with no explanation and no furigana, because its route
carries only the form. The app's and the website's form headline follows Reading Aids
([`dictionary.md`](../../../web/docs/product/dictionary.md), a form's headline); this one waits
for a route that carries the form's word and kind.

A meaning's Speak reads the whole display meaning, a gloss's note in brackets included,
because the word rows carry no glosses. The app's Speak reads the sense's glosses; that waits for
#1077, which adds them to the dictionary service's word answer.
