# The rules, from a client's side

What an app does with each synced entity, by its rule in the account service
([`account-entities.md`](account-entities.md)). How to sync, the first upload, and what to do with
each result are the [client guide](account-clients.md#how-to-sync); every field and its bounds are
in the API reference's [Sync entities](../api/account-api.md#sync-entities).

## Study data

- **The profile**, by the account's ID (or none): `update` with `name`, `username`, or both, at
  the version your app had, conflicts if the profile changed since. Only an app with `profile`
  reads or changes it.
- **Known words**, by item: a Language Reference ID, or `kanji:` and the kanji.
  - `mark` and `clear` take the version your app had. If the word changed since, it's a conflict.
  - Marking a known word, or clearing one not known, is applied and changes nothing.
  - **Tomodachi:** mark a word the first time it reaches "knows it". If the mark conflicts because
    the learner un-marked the word in Zenbu, don't send it again: mark it again only once the word
    climbs back to "knows it" (#563, decision 4).
- **Lists**, by UUID:
  - A rename or move conflicts if the list changed since.
  - A delete wins over everything done to the list since, and takes its words: when a list is
    deleted, drop its words on the device.
  - **Favorites has one ID in every app: `2177c773-9e88-410f-9348-6cefaebe0a93`.** An app that
    starts learners with a Favorites list gives it this ID, so every device's Favorites is one list
    in the account (lists are the account's own, so the ID can't collide with another learner's).
    On a second device, its `create` is rejected (`already_exists`): keep the list, take the
    account's copy as it comes down, and its words' adds still apply. If the account's copy comes
    down deleted, the device's Favorites never belonged to it: keep it and its words as a new list,
    under a new ID, rather than dropping them, even though an `add` to the deleted list was
    rejected (`unknown_list`). Any other list the account deleted is deleted on the device. The
    iOS app moves an older install's Favorites to this ID before its first upload.
- **List words**, `<list>/<item>`:
  - An add always applies.
  - A remove applies only if your app had the latest add: an add from elsewhere wins.
  - An add to a list that's gone is rejected (`unknown_list`): undo it.

## Watch history

What the iOS app's Player lists under Recent, as `watchedVideo`, by YouTube video ID. It needs
`watch:read` and `watch:write`.

- **Send the whole video with each `watch`:** `watchedAt`, when the learner last watched it, and
  whatever the device knows of `title`, `author` (the channel), `duration` and `position` (seconds),
  and `comprehension` (0 to 1). A field left out keeps the account's value, and the account keeps
  the later `watchedAt`. Send a watch each time one of them changes; while one is queued and not
  yet sent, a newer watch of the same video can replace it.
- **A watch of a video the account has always applies,** whatever its base version. The watch
  with the later `watchedAt` sets the place; an older one that arrives late only fills in fields
  the account lacks. So use the device's clock for `watchedAt`, and a time from 2000 on.
- **`remove`, when the learner removes a video, always applies.** A watch of a removed video
  applies only at the removal's version: one made before the device saw the removal conflicts,
  and `current` is the delete. Take it. Watching it again afterwards brings it back. Keep a removed
  video's version while the account remembers it: the latest 100 videos removed or pruned.
- **The account keeps the 50 latest by `watchedAt`.** A watch past that removes the oldest, which
  comes down as a `delete`; drop it. Keep 50 on the device the same way, by `watchedAt`, so a
  device that missed an old prune still shows what the account has. Don't send a `remove` for one
  your device drops for being past 50.
- **Order** the list by `watchedAt`, newest first.

## Translate bookmarks

The sentences the learner bookmarked in the iOS app's Translate tab, as `bookmarkedSentence`, by
the sentence's UUID. It needs `translations:read` and `translations:write`.

- **Send only the bookmarked sentence:** its `text`, its `translation` (or null), its `language`
  (`ja` or `en`), and `bookmarkedAt`. Never the conversation, its ID, or any sentence the learner
  didn't bookmark: conversations hold other people's words, and stay on the device.
- **An add always applies.** Un-bookmarking sends a `remove` at the version your app had, which
  conflicts if the sentence was bookmarked again elsewhere since: take `current`, and show it
  bookmarked. Deleting a conversation un-bookmarks its sentences, so send a `remove` for each.
- **A bookmark from another device** names a sentence whose conversation may not be on this one:
  show it on its own, with its translation.
- **At most 2,000** an account (`too_many_bookmarks`): undo the add.

## Notes

The learner's notes on words and kanji, as `wordNote`, by the note's UUID. It needs `notes:read`
and `notes:write`.

- **Send the whole note with each `write`:** its `item` (the word's Language Reference ID,
  `kanji:` and the kanji, or the `wn1:` note identity an earlier version saved it under), its
  `text`, and the `headword` and `reading` it was saved on. A new note writes at base version 0, a
  change at the version your app had. Clearing a note's text deletes it: send `delete`.
- **A write that conflicts** means the note changed elsewhere first, and `current` is it as it is
  now. Never drop your text: if `current`'s text is the one your change started from (the other
  device only moved it to its word), write yours again at `current`'s version; otherwise keep yours
  as a new note, under a new UUID, on the same word, beside `current`.
- **A delete that conflicts** means the note was written elsewhere since: take `current`, and show
  the note. A write of a note deleted elsewhere brings it back.
- **A note the service refuses** stays on the device, untouched: one over 10,000 characters
  (`invalid_fields`), and one past 10,000 notes an account (`too_many_notes`). Never delete or cut
  what the learner wrote; stop sending that note, and send it again when it next changes.

## Photos

The learner's Media Library, as `photo`, by the SHA-256 of its file, and the words each is on, as
`photoWord`, `<photo>/<item>`. It needs `photos:read` and `photos:write`. A photo's file goes through
`/v1/photos` ([`account-photos.md`](account-photos.md)).

- **Upload, then add.** Before a photo's `add`, upload its file with `PUT /v1/photos/{photoId}`; a
  `200` or `201` means the account holds it. Then send the `add` with its `name` and `savedAt`,
  and an `add` for each word it's on, with the word's `headword`, `reading`, and when the photo was
  saved on it. An `add` sent before the file is rejected `photo_not_uploaded`: upload the file, and
  send a new `add`.
- **A photo from another device** comes as a `photo` and its `photoWord`s. Download its file with
  `GET /v1/photos/{photoId}`, which may be kept for good. Hold a photo word until its photo comes,
  as a list word.
- **Removing a word** sends a `remove` at the version your app had, which conflicts if the photo
  was put on that word again elsewhere: take `current`. When the photo's last word goes, the
  account empties the photo, which comes down as the photo's `delete`; send only the word's
  `remove`. If a word added elsewhere comes down after, the photo comes back with it: show it
  again, downloading its file.
- **Deleting the photo** in the Media Library sends the photo's `delete`, which wins over words
  added elsewhere since: when a photo is deleted, drop its words on the device. Each word's removal
  comes down too, so a device that sees only the photo saved again still drops the old words.
- **A word the service refuses:** `unknown_photo` means the account has no such photo. If its
  photo's `add` is still queued, as after `photo_not_uploaded`, send the word again after it. If
  your app had the photo from the account, it was deleted elsewhere first: drop the word on the
  device, and the photo with it if no other word holds it; the photo's `delete` comes down too.
  Otherwise, as when the photo's file was refused, keep the word on the device without syncing.
  `photo_full` (500 words) keeps the word on the device without syncing.
- **Refused files** stay on the device without syncing: one over 12 MB (`413`), one that isn't an
  image the service takes (`415`), and one past 1,000 an account (`409 too_many_photos`), where a
  photo emptied in the last 30 days still holds its place: send it again once one is deleted.
- **A download that answers `404`** never deletes anything: `not_found` means the account no
  longer names the file, and its photo's `delete` is on its way; `photo_file_missing` means the
  account lost the file, which comes back when a device that holds the image uploads it, as one
  signing in to the account for the first time does. Ask again at most once a launch, not at
  every sync. Use the image a device already holds under the photo's ID rather than download it.
- **`429`** on a photo route means the account is sending its share of files at once: wait the
  seconds `Retry-After` says.

## The profile photo

The profile's photo, as `profilePhoto`, by the account's ID or none. It needs `profile`.

- **Upload, then set.** Upload the file with `PUT /v1/photos/{photoId}`, then send `set` with its
  `photoId` at the version your app had (0 for none). Removing it sends `remove`.
- **Without `photos:read`**, as on the website, upload the image before every `set`, even one the
  Media Library may hold: your app may set only a file it uploaded itself. It holds two at once,
  the profile photo and the one replacing it, so a `409 too_many_photos` means an upload it never
  set is still held: set it, or upload again a day later.
- **A conflict** means the photo changed elsewhere first: take `current`, a `put` with the photo's
  ID to download, or a `delete` for none.

## Settings

The learner's settings, as `setting`, by name, one entity each. It needs `settings:read` and
`settings:write`. The API reference lists every setting with its kind.

- **Send a `set`** each time the learner changes one, at the version your app had (0 for one the
  account never had). On a first upload, send only the settings the learner changed from your
  app's defaults, so a new device's defaults never replace what another device chose.
- **A conflict** means the setting changed elsewhere first: take `current` and show it. A `delete`
  means the account doesn't hold it: send yours again at version 0.
- **A setting the service refuses** (`unknown_setting`, or `invalid_fields` for a value out of its
  kind, as from an app newer than the service) stays on the device as the learner set it: stop
  sending it, and send it again once the service knows it.
- **What describes the device** isn't a setting: which frequency dictionaries are downloaded (the
  choice is `frequencyDictionaries.chosen`, and each device downloads its own copy), the camera
  flash, and Translate's layout.

## Recent searches

The searches the learner made, as `recentSearch`. It needs `searches:read` and `searches:write`.

- **Its ID** is the HMAC-SHA256 of the query in UTF-8, after Unicode NFC, under the account's
  `searchKey`, which each sync answer carries to an app with `searches:read`. Keep the key with the
  account, and hold recent searches back until the first answer brings it.
- **Send a `search`** with the `query` and `searchedAt` each time the learner searches, at the
  version your app had. A search of a query the account has always applies, and the later time is
  kept. A search the device kept without a time, from before it synced them, goes up in its order
  with times from 2000-01-02T00:00:00Z on, a second apart, oldest first, so it sorts after every
  search with a real time.
- **Removing one** sends `remove`, which always applies, and clearing them all sends one for each.
  A search the device made before it saw a removal conflicts, and `current` is the delete: take
  it. Keep a removed search's version while the account remembers it: the latest 100 removed or
  pruned.
- **The account keeps the 50 latest by `searchedAt`**: a search past that removes the oldest,
  which comes down as a `delete`. Keep 50 on the device the same way, don't send a `remove` for
  one your device drops for being past 50, and order them newest first.
- **A query over 1,000 characters** is refused (`invalid_fields`): keep it on the device only.
