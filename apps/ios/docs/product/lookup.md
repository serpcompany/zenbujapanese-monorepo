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
compares that explicit match evidence first. When the preceding evidence is equal, it orders by
the first enabled frequency dictionary, then breaks ties with each next enabled dictionary in
priority order. A rank dictionary sorts ascending by rank; the JLPT dictionary sorts N5 first
through N1. An entry a dictionary ranks or lists comes before one it does not. Frequency
never introduces an entry that the query did not retrieve or lets an incidental match outrank a
direct match. An English result displays the matching gloss, even when that gloss is not the
entry's first sense. Below the summary, a row of compact chips such as `JLPT N3` and
`YouTube 812` shows each enabled dictionary's level or rank in priority order. The first
dictionary's chip always appears, with a dash when it has no mapped evidence, except that JLPT
appears only for listed words; other dictionaries appear only when they rank the entry.
Each chip's dot shows how common the rank is: green for ranks up to 1,500, yellow up to
5,000, orange up to 15,000, red up to 30,000, and gray beyond. JLPT levels use the same scale:
green for N5 and N4, yellow for N3 and N2, and orange for N1. With Differentiate Without Color,
a star count from 5★ to 1★ replaces the dot. At accessibility text sizes, a row shows only the
first dictionary's chip, with the rank below the name, plus a `+N` count; VoiceOver still reads
every rank. At standard text sizes, the summary shows at
most two lines.

An inflected Japanese query in kana or kanji, such as `まけたら`, `食べさせられなかったら`, or
`勉強した`, is deinflected on the device without the optional Japanese Text Analysis resource.
Every dictionary form that exists with a matching word class is offered, so ambiguous kana
such as `いって` returns 言う, 行く, and 要る. When the query is itself a dictionary word
(`いって` is 一手), that exact match stays first and the dictionary forms follow it.

Entries that every enabled dictionary ties or leaves unranked retain the dictionary's deterministic fallback
order. While frequency data is loading, when no frequency dictionary is enabled, or when the
first enabled dictionary is unavailable, the whole collection uses dictionary relevance order.
With no enabled dictionary, rows show no frequency information. Unavailability is disclosed
below the results without blocking lookup.

Changing the enabled frequency dictionaries or their order updates the currently displayed
result collection without resubmitting the query. Results can also offer a Japanese-reading
refinement, related Example Sentences, discovered words, frequency information, and a dedicated
Kanji result for a single-kanji query.

A sparse radical-selection submission keeps its intentionally narrow leading lexical-rank
candidate group. Those candidates still appear in one **Results** collection and are ordered by
the enabled frequency dictionaries within that group.

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

A **Frequency** section after the meanings lists each enabled dictionary in priority order with
its commonness marker and rank or JLPT level, or "No rank" ("Not listed" for JLPT). Selecting a
row opens that dictionary's details: rank and percentile for a rank dictionary, or the JLPT level
with the note that levels are unofficial study estimates. The section is hidden when no dictionary is enabled.

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
