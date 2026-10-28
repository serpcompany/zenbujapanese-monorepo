# Synced entities

Each entity the account service syncs besides the profile, and the rule that decides what a change
to it does. Each rule is its own file in `apps/account-api/src/domain`, never blanket
last-write-wins: a change names the version it was made to (`baseVersion`), and the rule decides
what a stale one does. The profile's rule, and how a sync runs (the journal, mutation IDs, the
cursor), are in [`account-api.md`](account-api.md), Profiles and sync. How a client follows these
rules is [`account-client-rules.md`](account-client-rules.md), and every field's bounds are in the
API reference's [Sync entities](../api/account-api.md#sync-entities).

## Known words and lists

- **Known word** (`knownWord`, by item: a Language Reference ID, or `kanji:` and the kanji in
  Unicode NFC, as the iOS app keys `word-knowledge.json`): the item's state, one of Unknown,
  Learning, and Known (#1035). `set` moves it to any of the three; `mark` (to Known) and `clear`
  (from Known to Unknown) are what an app that sees only whether a word is known sends. Each
  applies only at the word's current version (0 for one never seen), and a change to the state the
  word has changes nothing. So a mark made before the learner cleared the word loses to the clear,
  and a mark made after seeing the clear wins, as #563's decision 4 says for Tomodachi. A clear
  that never saw a later mark conflicts, and the learner sees the word Known again.
- **When the state began** (`stateChangedAt`, #1096), so an app set up again by signing in can
  rebuild its progress from the account. Each change may send it, held as a watch's `watchedAt`
  is, and without one it is the service's time when the change applies. A change that moves the
  word keeps its time; one that leaves the state as it was, or conflicts, keeps the earlier one. A
  word whose state began before the service kept the time (`known_words.state_changed_at`, added
  empty) answers `null` until its state changes.
- **Learning, to an app that doesn't show it,** is not known (`known: false` beside `state`). Its
  mark makes a Learning word Known, and its clear of one changes nothing, as clearing any word not
  known does: it can't end a state it can't see, and an app that shows Learning ends it with
  `set`. The table keeps Known in `known`, which a service from before Learning still reads and
  writes during a deploy or after a rollback, and Learning in `learning` beside it, and Known wins
  when both are set, as after that service's mark of a Learning word. This service writes both
  from the state, so its next change to the word settles them.
- **While an older service runs,** its mark and then its clear of a Learning word write only
  `known`, so `learning` stays true and the word comes back Learning once this service returns,
  though the learner's last act was a clear. An app that shows Learning and pulled that clear then
  got `known: false` with no `state`, read it as Unknown, and keeps Unknown, as no later change
  touches the word, until the word changes again or the app's next full read. This is left as is:
  it needs a rollback with both acts inside it, and the word stays one the learner can set.
- **List** (`list`, by its UUID, in either case, as Swift writes it uppercase; answers name it in
  lowercase): `create` with a name and a position, then `update` at the current version, so two
  renames conflict and the second gets the name as it is now. An update that already matches the
  list is applied. A name is the app's rule: 1 to 500 characters once trimmed, with control
  characters made spaces, so nothing the app makes is refused. `delete` wins over everything done
  to the list since, renames and words added elsewhere too: the learner deleted it. It takes the
  list's words with it, and its ID can't be used again.
- **List word** (`listWord`, `<list>/<item>`): `add` always applies, and `remove` applies only at
  the current version, so it removes only an add it saw: an add the remover never saw wins.
- **Limits:** 500 lists an account and 5,000 words a list (`too_many_lists`, `list_full`); a
  word added to a deleted or unknown list is rejected (`unknown_list`).
- **Each keeps its history** as its version and a row that stays (a cleared word, a deleted list,
  a removed list word), so a stale change finds the version it lost to. A deleted list's words are
  deleted with it, and its row keeps no name.
- **Order:** on a page, lists come before their words, but a list word can come a page before its
  list, since the journal keeps each entity's latest change. A client holds such a word until the
  sync reaches `hasMore: false`. A rejected change (`unknown_list`, say) is undone on the device.

## Player's Recent and Translate bookmarks

- **Watched video** (`watchedVideo`, by its YouTube video ID, `src/domain/watch-history.ts`):
  `watch` sends `watchedAt` (an ISO 8601 time from 2000 on, by the app's clock; one after the
  service's time is taken as the service's) and any of the title, the channel (`author`), the
  duration, the position (both in seconds, 0 to 10,000,000), and the comprehension (0 to 1). A
  title or channel is cut to 200 characters, with control characters made spaces, and a blank one
  is left out, so nothing the app makes is refused. A watch of a video the account has applies at
  any version. The watch with the later `watchedAt` sets the place: an older watch that arrives
  late, from a device that was offline or uploading what it had, only fills in fields the account
  doesn't have, and a field a watch leaves out keeps its value. This rule and recent searches'
  read an app's clock, and only to order one learner's own entries. `remove` always applies, a pruned
  video too, and a watch of a removed video applies only at the removal's version, so a position
  sent by a device that hadn't seen the removal loses to it, and watching it again after seeing it
  brings it back.
- **Watch history stays bounded.** An account keeps the 50 videos with the latest `watchedAt`, as
  the app's Recent does: a watch past that prunes the oldest, never refuses the new one, and the
  prune syncs as a delete. A watch of a pruned video applies at any version, since the learner
  didn't remove it. A removed or pruned video's row keeps only its ID, its version, and when it
  was removed or pruned, and the account remembers the latest 100 of them by that time: older ones
  are forgotten with their journal rows, so the table and its journal hold at most 150 rows an
  account (the mutation results, kept 30 days as for every entity, name the videos too). A device
  that missed a forgotten prune still ends with the 50 newest, since it keeps 50 by `watchedAt`
  too. One that missed a forgotten removal keeps that video until newer ones push it out, and a
  watch it sends for it brings it back, at version 1, since the account no longer knows it was
  removed. Recent searches share this bound (`src/domain/recents.ts`).
- **Bookmarked sentence** (`bookmarkedSentence`, by the sentence's UUID, in either case,
  answered in lowercase, `src/domain/bookmarks.ts`): one sentence the learner bookmarked in
  Translate, never the conversation around it. `add` sends its `text` (cut to 2,000 characters),
  its `translation` (cut to 4,000, or null), its `language` (`ja` or `en`), and `bookmarkedAt` (the
  app's time, from 2000 on; the iOS app sends when the sentence was said for one bookmarked before
  it synced bookmarks); control characters become spaces, and nothing else is taken, the
  conversation's ID included. Like a list word, an add always applies, and adding one the account
  has changes nothing; `remove` applies only at the current version, so an add the remover never
  saw wins. A removed bookmark's row keeps only its ID and version, none of what was said. An
  account holds at most 2,000 (`too_many_bookmarks`).

## Notes, photos, settings, and recent searches

What else a learner keeps follows the account too (#867). Translate's conversations never do, and
neither does what describes the device: downloaded files, the camera flash, a picker's sections,
and the email typed while signed out.

- **Word note** (`wordNote`, by the note's UUID, answered in lowercase,
  `src/domain/word-notes.ts`): `write` sends the whole note: its `item` (a Language Reference ID,
  `kanji:` and the kanji, or the `wn1:` note identity an earlier app saved, which keeps the Notes
  Without a Word), its `text`, and the headword and reading it was saved on. A new note writes at
  version 0, a change at the note's version, and a write that matches the note changes nothing,
  so two devices that move a note to the same word agree. A write at an older version conflicts,
  and `current` is the note as it is; a write over a delete it never saw applies and brings the
  note back; `delete` applies only at the current version. So a delete removes only the text the
  learner saw, and neither device's writing is lost: the client keeps its text as a new note when
  `current`'s text differs from the one its change started from. A note's text is 1 to 10,000
  characters, line breaks and tabs kept, and never cut: the learner wrote it. A deleted note keeps
  only its ID and version, and the account remembers the latest 1,000 deleted notes: an older
  delete is forgotten with its journal row, and a device whose cursor is from before it is
  answered `410 invalid_cursor`, reads everything again, and drops the note. At most 10,000 notes
  an account (`too_many_notes`).
- **Photo** (`photo`, by the SHA-256 of its file, `src/domain/photos.ts`): the Media Library's
  photos, whose files [`account-photos.md`](account-photos.md) keeps. The ID is the file's hash
  because the iOS app already names each photo so: two devices that save the same image hold one
  photo. A photo is shown, emptied, or deleted:
  - `add` sends the name and `savedAt`, and applies once the account holds the file
    (`photo_not_uploaded` before), whatever the photo's version: the same image saved again after
    a delete comes back.
  - Removing its last word empties it, as the app does: it syncs as a `delete` marked `emptied:
    true`, but keeps its file, its place among the 1,000, and its name for 30 days, and a word added
    from a device that never saw the removal brings it back.
    So a word removed on one device and another added offline elsewhere end the same whichever
    syncs first, and no add is lost.
  - `delete` is the learner deleting it in the Media Library, and wins as a list's does: it marks
    every word on it removed, at a new version each, and takes the file. A word added later is
    rejected `unknown_photo`. A device away meanwhile hears of each word's removal even if the
    same image is saved again before it syncs.
  - Housekeeping empties a photo left with no word for a day, as when its words' adds failed, so
    the account shows no photo that no word shows, and deletes an emptied photo after 30 days,
    never sooner, since a word queued on a device may still bring it back. That deletion syncs as a
    plain `delete`, so devices learn its place was freed.
  - The account remembers its latest 1,000 deleted photos, as it does notes, and forgets an older
    one with its words.
  - **What the account forgets, no device keeps.** The account keeps the highest version and
    journal sequence it forgot of each kind (`forgotten_versions`). A note, photo, or word saved
    again after it's forgotten starts past that version, so a change from before conflicts rather
    than applying, and a device whose cursor the account has since forgotten a deletion past is
    refused `410 invalid_cursor`: it reads everything again and drops the notes, photos, and words
    it had from the account that didn't come. A read from no cursor is refused only for a deletion
    made after it began and forgotten before it reached it, or, once it reads past where it began,
    for an entry it read and the account forgot before its next request, as any device is.
- **Photo word** (`photoWord`, `<photo>/<item>`): a word or kanji the photo is on, by the same rule
  as a list word (`add` always applies to a photo the account has, `unknown_photo` otherwise;
  `remove` only at its version), with at most 500 a photo (`photo_full`). A removed word keeps its
  row and version, and each photo remembers its latest 500 removed words, so one photo's words
  never push out another's, and a device rereads only after one photo loses over 500 words while
  it's away, far past the few a photo is on. Adding a word journals its photo again, so a device
  that dropped the photo when its own last word went gets it back.
- **Profile photo** (`profilePhoto`, by the account's ID, or none, `src/domain/profile-photo.ts`):
  `set` with a file's SHA-256, and `remove`, each only at the profile photo's own version, as a
  profile's name is changed, so the second of two changes gets the photo as it is. It has a version
  of its own, not the profile's, so changing the name on the website never conflicts with a new
  photo from the app. Its file is replaced and deleted like a photo's. Read and changed with
  `profile`, like the name; an app without `photos:read` sets it only to a file it uploaded itself
  (`photo_not_uploaded` otherwise), a Media Library photo's once it sends the same image, so the
  profile can't reach into the library.
- **Setting** (`setting`, by name, `src/domain/settings.ts`): one entity for each setting the
  service lists (`settingRules`), each with its kind: on or off, one of its choices, a number in
  its range, or text of its pattern. A `set` applies only at the setting's version, so the first
  device to sync a change wins and the other shows it; each setting has its own version, so
  changing furigana on one device never conflicts with the speech speed on another. A name the
  service doesn't list is rejected `unknown_setting`, and the device keeps its value: settings are
  the device's first, and an older service only stops carrying a newer one. Translate's layout
  isn't one (#867's decision 3).
- **Recent search** (`recentSearch`, `src/domain/recent-searches.ts`): as watch history, with
  `searchedAt` for `watchedAt`: the later search keeps its time, the account keeps the latest 50
  (#867's decision 2), a prune syncs as a delete, a removal wins over a search that never saw it,
  and the latest 100 removed or pruned are remembered. Its ID is the HMAC-SHA256 of the query after
  NFC, under a key for the account that the service derives from its secret
  (`searchKeys`, `src/domain/cursor.ts`) and gives an app with `searches:read` in each sync answer:
  one query is one entity on every device, the service checks the ID, and a removed search keeps
  only an ID that no one with the database, or a backup, can turn back into the query.

The iOS app and the website have the scopes for notes, settings, and searches, and read photos,
which only the app changes ([`account-clients.md`](account-clients.md), Your app). The profile
photo goes with `profile`.
