# Word Detail

Word Detail is the side panel's page for one dictionary word, as the app's Word Detail
([`dictionary.md`](../../../ios/docs/product/dictionary.md)) without its saving: there are no
Lists, Notes, Mark as Known, Add Photo, or Look Up. Two more pages open from it: a kanji's detail
and the examples for one conjugated form. Each page draws only its content; the side panel draws
Back over it. The pages are built, and the side panel opens them once its page list registers
them (#978).

Every check below is in `src/word-detail/`, in happy-dom, on the dictionary core's fixtures
answered through a fixture source in the test: `word-detail-page.interaction.test.tsx` (word) and
`kanji-and-form-pages.interaction.test.tsx` (kanji and form).

## The word

| Behavior | Check |
| --- | --- |
| The top: the headword with furigana, pitch with its speaker or a Pronounce button, and the part of speech. Then Meaning, Frequency, Alternatives, Kanji, Alternative Kanji, Related Words, and Examples, each only when the word has it. 要る shows Meaning, Frequency, Kanji, and Examples. | word: 要る's top and sections |
| Reading Aids follow Settings: with Furigana off, the furigana goes and the reading shows under the headword. | word: Furigana off |
| Frequency lists the learner's chosen dictionaries in their chosen order (`frequencyDictionaries.chosen`, JLPT among them), and leaves the section out when none has the word. | word: Frequency follows the chosen dictionaries |
| A word with several entries, such as 要, shows each entry's reading as a tab, starting on the one that was chosen. | word: 要's two entries |
| The part of speech opens the conjugation table in a sheet. A form in it opens that form's examples. | word: the conjugation table |
| Each meaning has a menu: Speak reads it in an English voice, and Copy puts it on the clipboard and says "Meaning copied". | word: a meaning's Speak; a meaning's Copy |
| Share sends the word's zenbujapanese.com page to the system's share sheet; Copy Link, under •••, copies it. Without a share sheet, Share copies the link. | word: Share and Copy Link |
| Examples show 25 sentences; Load more examples fetches the next 25. | word: Load More |
| A linked word in a sentence, a kanji, an alternative kanji, or a related word opens its own page. | word: an example's word; Back through the pages |
| A related word the dictionary doesn't have opens a page that says "This word isn't in the dictionary." | word: いる's related word 有る |
| A related word given only by its spelling is looked up by it first, and says "有る isn’t in the dictionary." when nothing matches. | word: a related word with no target |

## The kanji and the form

| Behavior | Check |
| --- | --- |
| A kanji's page shows its readings, meanings, sections, and stroke order, and its words open their own pages. | kanji: 要's details |
| While the stroke order is still downloading, the page says so and shows the rest. | kanji: downloading |
| A form's page shows the form with a Pronounce button and the sentences that use it, 25 at a time, or "No example sentences use this form yet." | form: いる; a form none uses |

## While the dictionary can't answer

| Behavior | Check |
| --- | --- |
| Before the dictionary's data is ready, a page shows its progress instead. | kanji: not ready |
| When the dictionary fails, a page says "The dictionary couldn't answer. Try again." with Try again. | kanji: Try again |
| A word or kanji the dictionary doesn't have says it isn't in the dictionary. | kanji: outside the dictionary |

## Not built yet

Open Full Entry (#957), and checks in Chrome on the whole dictionary (食べる, 食, and で), come
with the side panel's registrations and #956's data.
