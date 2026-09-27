# Lookup

Lookup is the app's primary Product Experience. It appears as the **Search** tab and uses
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

An inflected Japanese query such as `まけたら` or `勉強した` finds its dictionary forms on the
device. When the query is itself a word (`いって` is 一手), that word stays first.

Changing the enabled dictionaries or their order re-sorts the visible results without searching
again. If frequency data can't be read, Search still shows every result and says which
dictionary is unavailable. Results can also offer a Japanese-reading refinement, related
Example Sentences, discovered words, and a dedicated Kanji result for a single-kanji query.

Recent text searches are stored on the device. A learner can repeat or remove one search,
or clear the entire history.

## Dictionary and kanji details

A word detail can present its written form and reading, ordered meanings, alternative forms,
kanji, related words, conjugations, source-matched Example Sentences, pronunciation, and
frequency information when the corresponding data is available.

The top of a word detail shows the headword with furigana, following the Reading Aids setting.
When furigana is off, the reading appears under the headword instead. To the right of the
headword are the pitch accent (the reading in katakana with an overline across the high morae and
a hook at the downstep), a pronounce button, and the latest encounter photo. A part-of-speech row
follows and opens the conjugation table when one exists.

A **Frequency** section lists each enabled dictionary's rank or JLPT level for the word.
Selecting a row opens that dictionary's details. JLPT levels are presented as unofficial study
estimates.

Selectable Japanese inside Word Detail and Example Sentences uses the same interactive
word-boundary analysis as Image Search. Selecting a linked word continues into its normal
dictionary entry.

A learner can write notes for a word and associate photos with it. Notes and associated
photos persist on the device.

A kanji detail can present readings, meanings, stroke order, components, elements, and words
that contain the kanji. Component and element links can be followed without losing the
learner's place in the preceding detail.

## Image Search

Image Search recognizes Japanese text in one or more selected images. A learner can:

- show or hide recognition underlines for every recognized Japanese token;
- use the same Kuromoji parser family as the Zenbu browser extension and other linked
  Japanese in the app for interactive word boundaries;
- select a recognized token to open the full Word Detail experience in a temporary,
  full-height sheet, including a candidate chooser or no-entry state when needed, with an
  option to continue to the normal full-screen dictionary route;
- copy the recognized text;
- share the selected source image; and
- request a Japanese-to-English natural translation when Apple's on-device translation is
  supported and prepared.

The Image Search session itself is temporary. Opening a recognized word associates the
source image with that word as Encounter Media, which then appears in the Media Library.
