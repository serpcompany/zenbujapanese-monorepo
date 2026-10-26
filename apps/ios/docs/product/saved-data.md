# Notes, photos, and saved data

What a learner keeps on a word or kanji besides marking it known and adding it to lists: notes,
photos, and the Media Library that holds the photos, which a word's or kanji's **•••** menu adds
([Dictionary](dictionary.md#dictionary-and-kanji-details)); how Look Up finds a word by its notes;
what happens to the notes and photos an earlier version saved; and what the app does with saved
data it can't read. Known Words and Lists are under [Account](index.md#account).

## Notes and photos

A learner can write notes for a word and associate photos with it. Notes and associated
photos persist on the device, keyed by the word's Language Reference ID, as known words and lists
are, so a dictionary update that edits the word's meanings keeps them on it. Each note keeps its
word's headword and reading too, so it can still be named if the dictionary drops the word, and a
note under an entry JMdict lists twice moves to the one the word's page shows. A note written while
the page is still loading its examples is kept like any other. If saved notes can't be read, a
copy is kept on the device rather than written over, and every note that can be read stays, on
its word or any other ([Saved data that can't be read](#saved-data-that-cant-be-read)).
Signed in, notes, photos and the words each is on, and recent searches sync to the learner's other
devices, by the rules in [Zenbu account and sync](account-sync.md).

Tapping a note, or **Add Note** under a word's or kanji's notes, opens its field with the keyboard
ready to type, on the Mac too, where a click on a note used to leave the keyboard with the page.
A note is saved when the learner taps **Done**, opens another, or leaves the page, and also, as far
as it's typed, whenever Zenbu leaves the screen (the Home Screen or the app switcher on iPhone and
iPad) or the Mac app quits, with its field still open to go on. Text cleared from a note is kept
until editing ends, so leaving mid-change never deletes a note. So a note survives Zenbu being
swiped away or quit mid-sentence, and syncs once each time it's saved, not as it's typed.

Check: UI `NotesInSearchUITests.testANoteFindsItsWordUnderInYourNotesAndEachChangeShowsAtOnce`
(the note written from **Add Note**, then opened, changed, and cleared);
`WordDetailUITests.testANoteIsKeptOnTheWord`, `WordDetailUITests.testANoteBeingTypedIsKeptWhenZenbuIsClosed`
(typed, Zenbu sent to the Home Screen and ended, or quit with ⌘Q on the Mac, then reopened), and
`SavedWordsUITests.testAnImagesWordKeepsTheImageInTheMediaLibraryUntilItsDeleted`; package
`WordNoteStorageTests`, `TypedDraftsTests` (a note being typed saved, once, as Zenbu goes inactive,
still open, and an emptied one left until Done), `EncounterMediaStorageTests`, and
`EarlierWordKeysTests` (a word's key is
its Language Reference ID, which an edit to its meanings doesn't change, and a note under the
other entry of 閻魔 moves to the one its page shows).

## Notes in Look Up

[Look Up](dictionary.md#look-up) also looks through the learner's notes. A note with the query
anywhere in its text lists its word, or its kanji, in a group of its own, **In your notes**, after
the Dictionary Matches. The note is read as Look Up reads a query: width, case, and a halfwidth
kana with its voiced mark are folded, and white space of any kind is one space, so `squish` finds
"To ＳＱＵＩＳＨ". Hiragana and katakana are not folded together, just as Look Up doesn't fold them
in a query: `がっこう` doesn't find a note that says ガッコウ. Each row shows the
word with its reading and the part of the note that matched, in bold, with up to 20 characters
before it and the note cut to 80 around it, at a space where there is one; where how a letter
folds depends on its word (a Greek word's last Σ), the whole word is in bold. A note that is the
query comes first, then one that starts with it, then the rest, each by headword; a note on
several words lists each of them. Tapping a row opens the word's or the kanji's page.

A note never adds a row to the Dictionary Matches, takes one away, or moves one, and the **Sorted
by** row's order and filter leave the group alone. When the dictionary has no matches, Look Up
still says **No Dictionary Matches**, with the notes listed under it. A note under
[Notes Without a Word](#notes-without-a-word) isn't listed, since its word has no page, nor is
a note no word or kanji names while the dictionary can't be read.

The group is drawn with the results, never after them. Writing, changing, or deleting a note
changes it at once, on a Look Up screen already showing it too, and it is the same after a
relaunch. Look Up reads the notes on the device; notes a signed-in learner wrote on another device
are found once they've synced.

Check: core `results/notes.test.ts` (matching any part of a note, the folding, the part shown and
where it's cut, a Greek word's last Σ, the order, and one note on several words) and
`embedded/dictionary.test.ts`; package `LearnerNotesTests` (a note in Look Up as soon as it's
written, changed, or deleted on its page, after a relaunch, a kanji's note, none of the Notes
Without a Word, and none with no name while the dictionary can't be read); UI
`NotesInSearchUITests.testANoteFindsItsWordUnderInYourNotesAndEachChangeShowsAtOnce` (written
from **Add Note**, found, then changed and deleted),
`NotesInSearchUITests.testOneNoteOnTwoWordsListsBothThenAndAfterARelaunch` (drawn once with
the results, after the relaunch), and
`NotesInSearchUITests.testNotesListedAfterTheDictionaryMatchesLeaveThemAsTheyWere` (two notes on
食べる's last match and on 日本, which 食べる doesn't match, leave 食べる's matches as they were,
and follow them).

## Notes and photos an earlier version saved

Earlier versions saved a word's notes and photos under a hash of its headword, forms, and meanings
(its note identity). The first time the app reads them, it moves each to the Language Reference ID
of the word that hash names in its dictionary, so they show on the same word as before, and a word
JMdict lists twice keeps the notes saved under either entry. The app's dictionary gives every
word the hash 1.0.0, 1.0.1, and 2.0.0 gave it, so every note those versions saved moves to its
word. A note whose hash names no word, such as one a test build saved on a word since edited, is
kept as it was and listed under Account's [Notes Without a Word](#notes-without-a-word), where the
learner can copy or delete it; a photo whose word is gone stays in the
[Media Library](#media-library), with the headword it was saved with. While the dictionary can't
be read, nothing moves and nothing is listed as without a word; the next launch that can read it
moves them.

Check: UI `WordDetailUITests.testANoteAnEarlierVersionSavedIsOnItsWord` and
`SavedWordsUITests.testANoteWhoseWordIsGoneIsListedUntilItsDeleted`; package
`EarlierWordKeysTests` (notes and photos moved from their hash to the word's ID, both entries of a
word JMdict lists twice, a kanji's notes left on the kanji, a note whose word is gone kept, listed,
and deleted, notes and photos moved at a later launch when the dictionary couldn't be read, the
newer text of a note kept, and earlier notes that can't all be read, or aren't data, kept aside);
contract `test_note_identity_contract.py` (every entry's hash pinned as those versions had it).

## Notes Without a Word

Account shows a **Notes Without a Word** row, with how many, only while some note is under a key
the app's dictionary has no page for: a hash an earlier version saved that names no word, or a
Language Reference ID or kanji the dictionary no longer has. Each launch asks the dictionary again.
The row opens a list of those notes, each with its text and, under it, the headword it was saved
on, the kanji, or else its key, and a line below them saying why they aren't on a page. A swipe
(right-click on the Mac) offers
**Delete** and **Copy**, which copies the note's text; a full swipe doesn't delete, since a deleted
note can't be brought back. Once none are left, the list says so, and the row is gone from
Account.

Check: UI `SavedWordsUITests.testANoteWhoseWordIsGoneIsListedUntilItsDeleted` (a hash's note and
a dropped word's, named by its headword); package `DroppedWordNotesTests` (a dropped word's and a
dropped kanji's notes listed, not those of a word or kanji the dictionary has),
`EarlierWordKeysTests.listsNotesWithoutAWordUntilDeleted`, and
`EarlierWordKeysTests.namesTheWordOfANoteWithoutOne`.

## Media Library

The current Media Library works like a small saved-photo album. It contains images associated
with words through Image Search or Word Detail. Each image appears once with all of its
associated words, even when several words share it. A learner can view an image, remove its
association from one word, or delete the image and all of its word associations.

Check: UI `SavedWordsUITests.testAnImagesWordKeepsTheImageInTheMediaLibraryUntilItsDeleted` and
`AccountUITests` (empty at first); package `EncounterMediaStorageTests`.

These images are stored locally and participate in normal system-managed device backup; signed
in, each also goes to the learner's Zenbu account, as the app saved it, and down to their other
devices ([Zenbu account and sync](account-sync.md)). The Media Library is not currently a general
file store, import system, analysis tool, or publishing destination.

A photo from Files or a drop loses where and how it was taken (its GPS, camera, and other metadata)
when it's saved, keeping which way is up; the camera's and the photo library's copies never had it.

Deleting a photo, or removing it from its last word, here or on another signed-in device, deletes
its image at once, unless a copy of
the index kept aside (below) names the photo, or one can't be read. Then the image goes later,
checked at most once a day as Zenbu opens or comes back, or as a word's photos or the Media
Library load: once no kept copy names it, and once 30
days have passed since it was deleted even if one still does; while a kept copy can't be read,
such as before the device's first unlock, it waits.
If Zenbu can't record the deletion, as on a full device, that image stays. Zenbu deletes an image
only after the learner deletes its photo, or removes the photo from the last word the Media
Library shows it with.

Check: package `DeferredImageDeletionsTests` and `EncounterMediaStorageTests`.

## Saved data that can't be read

Player's Recent, word notes, the Media Library's index, and the profile keep what a learner saved
when this version of Zenbu can't read it, as Known Words and Lists do: the saved data is copied
aside on the device (the newest three copies of each are kept) rather than written over, each
keeps every video, note, or photo it can read, and new changes save as before. A profile that
can't be read starts empty. If the Media Library's index can't be opened or copied aside, the
Media Library shows nothing and saves nothing until it can, rather than write over it.

Check: package `UnreadableCopyTests`, `WordNoteStorageTests`, `UserProfileTests`,
`EncounterMediaStorageTests`, and `AccountSyncWatchHistoryTests`.
