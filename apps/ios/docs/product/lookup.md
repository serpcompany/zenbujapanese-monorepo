# Lookup

Lookup is the app's primary Product Experience. It appears as the **Search** tab and uses
bundled Language Reference Data so ordinary dictionary lookup works offline.

## Search

A learner can search in Japanese or English using:

- the keyboard;
- handwriting recognition;
- radical selection; or
- Image Search using the camera, Photo Library, or an image file.

Ordinary Japanese, English, and romaji searches present one **Results** collection. The app
first builds a bounded set from exact, prefix, contains, gloss, and romaji query evidence. It
compares that explicit match evidence first, then uses ascending rank from the active frequency
dictionary when the preceding evidence is equal. Frequency
never introduces an entry that the query did not retrieve or lets an incidental match outrank a
direct match. An English result displays the matching gloss, even when that gloss is not the
entry's first sense. Entries without mapped evidence remain visible with a dash.

Equal ranks and entries without mapped evidence retain the dictionary's deterministic fallback
order. While frequency data is loading, or when the active dictionary is
unavailable, the whole collection uses dictionary relevance order. Unavailability is disclosed
below the results without blocking lookup.

Changing the active frequency dictionary reorders the currently displayed result collection
without resubmitting the query. Results can also offer a Japanese-reading refinement, related
Example Sentences, discovered words, frequency information, and a dedicated Kanji result for a
single-kanji query.

A sparse radical-selection submission keeps its intentionally narrow leading lexical-rank
candidate group. Those candidates still appear in one **Results** collection and are ordered by
the active frequency dictionary within that group.

Recent text searches are stored on the device. A learner can repeat or remove one search,
or clear the entire history.

## Dictionary and kanji details

A word detail can present its written form and reading, ordered meanings, alternative forms,
kanji, related words, conjugations, source-matched Example Sentences, pronunciation, and
frequency information when the corresponding data is available.

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
