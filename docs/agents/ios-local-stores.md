# The app's local stores

How the app keeps what a learner saves on the device: known words, lists, word notes, the Media
Library, Player's Recent, and the profile. Building and testing the app is in
[`ios.md`](ios.md), and what a learner sees of each store is in the
[product docs](../../apps/ios/docs/product/index.md).

## Known words and lists

Known words (`WordKnowledge.swift`) and word lists (`WordLists.swift`) each keep one versioned
JSON file through `LocalJSONFile`, loaded once off the main actor and rewritten in full, with
dates in milliseconds since 1970. `LocalFileWriteQueue` runs the load and then each write in
order, so a write never races the load. A file this version can't read in full is copied aside
(`UnreadableCopy`) before its readable records replace it, and records decode one at a time
(`LossyDecodable`), so one bad record doesn't lose the rest. A file from a newer version, or one
that can't be read at launch (before the device's first unlock), is never written over; the store
is read-only instead.

Both files are at version 2, which added kanji; a version 1 app would read kanji as words, so it
opens a version 2 file read-only. A word is keyed by its Language Reference ID and a kanji by
`kanji:` and the character (`SavedItem.storedID`), which can't collide with the hexadecimal ID.
Marking a word unknown keeps its record, so a later sync can tell a removal from no status. List
records are shaped to become database rows, and a membership keeps its headword so the word can
still be found if its entry's ID changes. Each store reports a learner's change to the account
sync (`changeObserver`), and takes the account's changes through `applySynced`, which reports
nothing ([Account and sync](ios.md#account-and-sync)).

## Recent, notes, the profile, and the Media Library

The stores in `UserDefaults` that hold records, Player's Recent (`WatchHistory`), word notes
(`WordNoteStorage`, under `lookup.word-notes.v5`), and the profile (`UserProfile`), and the Media
Library's `index.json` (`EncounterMediaStorage`) follow the same rule without a version: what
doesn't decode is copied aside, a value under `<key>.unreadable-<time>-<id>` or a file beside it
(`UnreadableCopy`, which keeps the copy it just made and the newest 2 before it, and makes no
copy of bytes a copy already holds; a value that isn't data at all is kept aside the same way,
`storedData(forKey:)`), and the store carries on, still writable, from the records
it could read (each video, note, and Media Library record; the profile is one record, so it
starts empty). A Media Library index that can't be opened or copied aside is neither read nor
written until it can be. Word notes are saved one note at a time (`WordNoteStorage.save`), so two
pages open on one word, in two windows on iPad or the Mac, can't drop each other's new notes, and
a page saves a note only when its text changed while it was being edited (when both pages change
the same note, the last save wins); likewise Profile saves a field only when its
text changed while it had focus, shows the newest saved value whenever the field doesn't have
focus or is left unchanged, and keeps a rejected email as typed until it's focused again
(`ProfileFieldEdit`), so the Mac's Settings and an Account tab don't write over each other.

## A deleted photo's image

The Media Library deletes only images the learner deleted. When a kept copy of the index names
the photo, or a copy can't be read, `deleteImage` records its ID and when in
`deferred-deletions.json` (`DeferredImageDeletions`), as it does an image it couldn't remove.
At most once a day, after the index reads (for a word's photos, the Media Library, or
`deleteImagesDue`, which `AppLifecycle` calls when the app becomes active; on the Mac that's
seldom, since the app stays active while any window is in front), `retryDeferredDeletions` drops
the IDs the index names
again, by a media record or an encounter, without deleting their images, and deletes each other
recorded image that no kept copy names, or that has waited 30 days (`longestWait`) whatever a
kept copy names, so a deleted photo is gone within 30 days (the
[Privacy Policy](../../apps/web/docs/product/privacy.md) keeps data until it's deleted in the
app). It does nothing while a kept copy can't be read, and writes the list only when
it changed. `save` takes a photo saved again off the list once the index is written. A kept copy
or a damaged list names an ID only as a whole run of 64 lowercase hex digits in its bytes
(`DeferredImageDeletions.mediaIDs`), and a list's names that aren't such an ID are dropped as it
loads, so no name reaches a file outside the folder. Only a missing list reads as empty: a damaged one is copied
aside and its IDs recovered, dated again (so their 30 days start over), and one that can't be read or written records and
retries nothing until the next launch, so a photo deleted then keeps its image, and its ID is
logged. The store takes its copy step as `keepCopy` and its clock as `now`, so
`EncounterMediaStorageTests` and `DeferredImageDeletionsTests` can make a copy fail and move the
days on.

## Notes and photos an earlier version saved

Word notes and the Media Library's encounters are keyed as known words and lists are
(`SavedItem.id`, a `SavedItemID`), and each note also keeps its word's headword and reading
(`LearnerWordNote`). Until #474 they were keyed by the word's note identity, the `wn1:` hash of
its headword, forms, senses, and parts of speech that `import_jmdict.py` writes to
`note_identity`, so an edit to a word's meanings detached them; notes were under
`lookup.word-notes.v4`. A key that is neither a Language Reference ID nor a kanji's is a note
identity.

Before a store first reads or writes in a launch, in one task its other calls wait for, it places
every key it holds through `SavedKeyLookup`, which answers each key's word or marks it missing:
a note identity through `LanguageReferenceData.words(named:)`, which looks the hashes up in
`note_identity` (an indexed column of `LanguageReferenceData.sqlite3`); a Language Reference ID
through `shownWords`; both by `entries(equivalentTo:)`, so a key moves to the ID its word's page
shows, the smaller of the two for a word JMdict lists twice; and a kanji by whether
`KanjiFiles` has its record. `WordNoteStorage` first merges `lookup.word-notes.v4` into v5, where
a note already in v5 keeps v5's text, then moves each key's notes to their word, labeling them
with its headword and reading, and removes v4 once v5 is written; a v4 that can't be read in full
is kept aside as any store is. The Media Library moves an encounter whose word's ID differs from
its key, and keeps the headword it was saved with.

A missing key's notes stay under it, and each launch asks again. They are `withoutAWord`, which
Account's **Notes Without a Word** lists by the headword a note was saved on, the kanji, or else the
key (`NotesWithoutAWord`, loaded once at launch into the app's environment, so the row is there
when Account is first drawn, unless Account opens before the move finishes and the row appears
when it does; the screen's deletions change it, so the row goes on the Mac too, where a covered
screen's `.task` doesn't run again). A full swipe doesn't delete a note there, since a deletion
can't be undone. A missing key's photos stay in the Media Library with their headword. When the
dictionary can't be read, `SavedKeyLookup` answers nothing: nothing moves, `withoutAWord` lists
nothing, and the next launch that can read it places them.

The mapping holds only while each entry keeps the `note_identity` the version that saved a note
gave it, and a learner can update from 1.0.0 straight to any later version. In the bundled
database every entry has the value it had in 1.0.1's, which 1.0.0 shares, and in 2.0.0's: the
#474 check compared all 218,382 entries' IDs and hashes against 1.0.1's database from Git LFS.
`import_jmdict.py` still computes the hash from each entry, so a JMdict refresh that edits a word
would give it a new one; `test_note_identity_contract.py` pins every entry's ID and hash, and fails
such a rebuild until the importer writes each existing entry's value from the previous database
([`apps/ios/Tools/README.md`](../../apps/ios/Tools/README.md), Refresh a source snapshot).
`EarlierWordKeysTests` reads the bundled database, so it fails without the column.

## Notes in Search

Search lists the notes whose words the dictionary has
([product docs](../../apps/ios/docs/product/saved-data.md#notes-in-search)). `LearnerNotes`
(`LearnerNotes.swift`), in the app's environment, holds them as `WordNoteStorage.onTheirWords`
reads them: after the move above, every note under a Language Reference ID or a kanji, and none
under a note identity or a key `withoutAWord`. It reads them once at launch, and again after each
save through `WordNoteStore` (`kept(in:searchedBy:)`, which `live` is), once the note is written,
and its `revision` goes up when they change. A note with no headword to show, which only a
launch that couldn't read the dictionary leaves, isn't listed. Which notes match, their order,
and the part shown are the core's (`notesInSearch`, [`dictionary-core.md`](dictionary-core.md)):
`LearnerNotes.inSearch` hands it the query and every note off the main thread, as the results
screen's request is, and answers `ShownNotes`, stamped with the revision it read. `SearchView`
waits for the first read, then asks for the notes after the results screen and sets both
together, so the group is drawn with the results and never after (`search.notes.drawn` records
each one drawn); a task keyed on both revisions asks again when they differ, so a Search screen
already showing the group, in any window, draws the change. Notes never sync: nothing here
reaches the account ([Account and sync](ios.md#account-and-sync)). `LearnerNotesTests` saves,
changes, and deletes a note through a page's `SavedItemNotes` and reads Search's answer after
each save.
