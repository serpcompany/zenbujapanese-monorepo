# Dictionary

Dictionary is the app's primary Product Experience. It appears as the **Search** tab and uses
bundled Language Reference Data so ordinary dictionary lookup works offline.

## Search

A learner can search in Japanese or English using:

- the keyboard;
- handwriting recognition;
- radical selection; or
- Image Search using the camera, Photo Library, or an image file.

Japanese, English, and romaji searches show one **Results** list. Stronger matches come first;
among equally good matches, the enabled frequency dictionaries decide the order, in the
learner's priority order (see [Frequency Dictionaries](index.md#you)). Frequency never adds a
result the query did not match or lifts an incidental match above a direct one. English rows
show the meaning that matched.

Each row shows compact chips such as `JLPT N3` or `YouTube 812`, one per enabled dictionary
that ranks or lists the word, with a colored dot for how common it is.

A word the learner knows shows a green **✓ Known** capsule at the right of its headword.
Swiping a row to the right, or long-pressing it, marks the word known or unknown without
opening it.

An inflected Japanese query such as `まけたら` or `勉強した` finds its dictionary forms on the
device. When the query is itself a word (`いって` is 一手), that word stays first.

Changing the enabled dictionaries or their order re-sorts the visible results without searching
again. If frequency data can't be read, Search still shows every result and says which
dictionary is unavailable. Results can also offer a Japanese-reading refinement, related
Example Sentences, discovered words, and a dedicated Kanji result for a single-kanji query.

Recent text searches are stored on the device and listed under a **Recent** heading while the
query is empty. A learner can repeat a search, remove one by swiping or long-pressing it, or clear the entire history
from the **⋯** menu, which appears only while recent searches are listed. Result headings scroll
with the results instead of staying pinned over them.

## Dictionary and kanji details

A word detail can present its written form and reading, ordered meanings, alternative forms,
kanji, related words, conjugations, source-matched Example Sentences, pronunciation, and
frequency information when the corresponding data is available.
Below the top card, sections appear in this order: Meaning, Frequency, Alternatives (other
written forms), Kanji, Alternative Kanji, Related Words, Lists, Notes, and Examples.

The top of a word detail shows the headword with furigana, following the Reading Aids setting.
When furigana is off, the reading appears under the headword instead. To the right of the
headword are the pitch accent (the reading in katakana with an overline across the high morae and
a hook at the downstep), a pronounce button, and the latest encounter photo. A part-of-speech row
follows and opens the conjugation table when one exists. It names one word class and then its
modifiers in sentence case without repeating "verb", for example "Godan verb (intransitive)",
"Noun · する verb (transitive)", "Adverb (と)", or "Pre-noun adjective".

The conjugation table starts with the word, its reading and meaning, its word class, and a
one-line rule for how that class conjugates. A Plain/Polite control switches register when both
exist. Each row names the form and shows it with the changed ending highlighted. Selecting a row
opens that form's screen. It leads with what the form means, then shows the form the way Word
Detail shows a word (furigana and a pronounce button) with its ending highlighted, and then every
Example Sentence that uses the complete form, in the same list Word Detail uses. Forms that share a spelling, such as potential and
passive 見られる, say so. Selecting a word in the example opens its Word Detail, and Back returns
to the form.

Linked Japanese in Example Sentences gives each word its own underline, so word boundaries are
visible. An inflected verb or adjective is one word with its endings, such as 見なかった,
見ている, or 静かな, and opens its dictionary entry. The words that make up the current entry or
the searched form are accented. Words the learner marked known have no underline, and no
furigana when **Hide Furigana on Known Words** is on, but can still be selected. With **Show
Word Meanings** on, each unknown word shows a short accent-colored meaning under it, and
**Show Sentence Translations** controls whether example sentences show their English.

A **Frequency** section lists each enabled dictionary's rank or JLPT level for the word.
Selecting a row opens that dictionary's details. JLPT levels are presented as unofficial study
estimates.

Selectable Japanese inside Word Detail and Example Sentences uses the same interactive
word-boundary analysis as Image Search. Selecting a linked word continues into its normal
dictionary entry.

The top-right of a word detail holds **Share**, which shares the headword, reading, and numbered
meanings as text, and a **•••** menu. The menu starts with **Mark as Known** (or **Mark as
Unknown**) and **Add to List…**, followed by Add Note, Take Photo, and Choose Photo. A known word shows the same
**✓ Known** capsule under its headword. A word counts as unknown until the learner marks it, and
known words persist on the device, keyed by the dictionary entry's stable identifier.

**Add to List…** opens a sheet listing every word list, with a checkmark on the lists that
contain the word. Tapping a list adds or removes the word at once, **New List** asks for a name,
creates the list, and adds the word to it, and Done closes the sheet. A **Lists** section above
Notes names every list holding the word, each opening that list in Account, followed by
**Add to List**, which opens the same sheet. Search results don't show which lists a word is in.

A learner can write notes for a word and associate photos with it. Notes and associated
photos persist on the device.

A kanji detail can present readings, meanings, stroke order, components, elements, and words
that contain the kanji. Component and element links can be followed without losing the
learner's place in the preceding detail.

## Image Search

Image Search recognizes Japanese text in one or more selected images. It reads both
horizontal and vertical (縦書き) Japanese; vertical columns are read top to bottom, right to
left, and English elsewhere in the image does not hide the Japanese. A learner can:

- show or hide recognition underlines for every recognized Japanese token;
- use the same Kuromoji parser family as the Zenbu browser extension and other linked
  Japanese in the app for interactive word boundaries;
- select a recognized token to open the full Word Detail experience in a temporary,
  full-height sheet. A token with several possible entries opens a **Choose** list that uses
  Search's result rows, and one with none shows a no-entry state. The sheet's top bar has a
  close button and **Open Full Entry**, which continues to the normal full-screen dictionary
  route in the tab the sheet was opened from;
- copy the recognized text;
- share the selected source image; and
- request a Japanese-to-English natural translation when Apple's on-device translation is
  supported and prepared.

The Image Search session itself is temporary. Opening a recognized word associates the
source image with that word as Encounter Media, which then appears in the Media Library.
