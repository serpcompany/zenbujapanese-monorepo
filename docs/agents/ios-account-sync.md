# How the iOS app syncs

The iOS app's side of the account service's sync ([`account-clients.md`](account-clients.md), and
each entity's rules in [`account-client-rules.md`](account-client-rules.md)): the queue, the first
upload, each entity's own handling, when it syncs, deleting the account, and the tests. Which
service a build signs in to, Apple, Google, and the tokens are in [`ios.md`](ios.md), Account and
sync; what the learner sees is in the product docs'
[Zenbu account and sync](../../apps/ios/docs/product/account-sync.md).

- **The queue.** `account-sync.json`, beside the stores, holds the account's ID and email, the
  queue, the cursor, the last sync, each entity's server version, and list words waiting for their
  list. A learner's change becomes a queued mutation with a new ID and, as `baseVersion`, the
  entity's last server version (or the base of a change to it still queued). A change made before
  the file loads is queued once it has.
- **Signing in and out.** Signing out forgets the session token but keeps the queue, cursor,
  versions, and waiting words under the account's user ID (`signedOutFrom`), and keeps queuing
  changes with their base versions. While signed out (`signedOutQueueStart`), a change replaces an
  earlier one to the same known word or list word from the same signed-out stretch, a list's renames
  and moves merge into its earlier `create` or `update`, and its `delete` replaces an earlier
  `update`, so the queue holds about one change per entity however long the learner stays signed
  out. Nothing queued before signing out is merged, since it may have been sent. Signing in to the
  same user ID picks them up and syncs from the kept cursor. Signing in to any other account drops
  them, moves Favorites to its shared ID (`WordLists.favoritesID`, from the oldest list if it's
  still named Favorites), and records that the account has none of the phone's data yet
  (`syncedEntities` empty). The next sync's catch-up (below) then queues the phone's marks, lists,
  list words, Recent videos, bookmarked sentences, notes, photos and their words, the profile photo
  (not when the phone signed out of another account: that account's photo stays its own), and the
  settings and frequency dictionaries changed from their standard, at version 0, ahead of anything
  queued since, and the recent searches once the first answer brings the account's search key. The
  stores it reads wait for the dictionary and the packs to open, which can take seconds at launch,
  so the sign-in sheet closes before, and a phone closed or signed out before that sync still
  uploads at the next one: the catch-up checks the account is the same after its waits, and runs
  again for the next sign-in. Deleting the account drops everything.
- **Entities added later.** `account-sync.json` names the entities the account's first upload
  covered (`syncedEntities`; a file without it covered known words, lists, and list words). A phone
  that signed in before its app synced an entity, such as watch history, queues that entity's items
  at version 0 on its launch's first sync, and syncs from no cursor, since its cursor passed that
  entity's changes. That first sync also moves `missingFiles` back to `waitingFiles`, queues again
  the settings the account refused (`retryNextLaunch`) and the photos refused as too many
  (`refusedPhotos`), and resumes the frequency dictionaries another device chose. A change the service rejects as `unknown_entity`, from a service older than the
  app, isn't undone: its entity is marked not uploaded and its other queued changes are dropped, so
  the phone stops sending them, and each launch's first sync uploads that entity again, from no
  cursor, until the service knows it.
- **Watch history.** `WatchHistory` (`WatchHistory.swift`, in `UserDefaults` under
  `watch.recent-videos.v1`) reports each `record` and swipe removal through `changeObserver`, and
  takes the account's copies through `applySynced`, which report nothing. It keeps the 50 newest
  by `watchedAt` either way, so a video dropped past 50 sends no `remove`: the account prunes its
  own. A video saved before Recent kept a time is dated from 2000-01-01 when the history loads, a
  second apart in its order, so it keeps its place on the phone and every video watched since,
  anywhere, is newer. Each `record` queues the whole video as a `watch`, dated by the phone's
  clock, and a newer change to a video replaces a queued one that isn't its first, the only one
  that can be on its way, so a waiting watch is replaced rather than joined.
  `WatchSessionView` records the video as it opens, as its captions, length, and comprehension
  arrive, and as it closes. A pulled video whose ID isn't a YouTube video ID, or isn't the
  change's, is left out. The file keeps a removed or pruned video's version for the latest 100
  (`goneVideos`), as the account remembers its latest 100.
- **Translate bookmarks.** `ConversationHistory.shared` (in `TranslatorCore`) reports each bookmark
  and un-bookmark through `bookmarkObserver`, with the sentence's text, translation, language, and
  `bookmarkedAt`, and never the conversation; deleting a conversation reports its bookmarks
  removed. `AccountSync`, in `SearchExperience`, turns those into `bookmarkedSentence` changes, so
  `TranslatorCore` still imports nothing of the app's (ADR 0011). The account's copies come in
  through `applySynced` and `applySyncedRemoval(ofBookmark:)`: a sentence in a conversation on this
  phone is marked there, and any other is kept in `Synced Bookmarks/bookmarks.json`, inside the
  conversations folder, which `ConversationHistory.bookmarks` lists beside the conversations' own,
  newest first, each sentence once. Its writes merge, so a pull of many writes the file about once.
  Sync waits for the history to load, and stops, as for an unreadable lists file, while that file
  can't be read (`bookmarksProblem`), for whatever reason, until the next launch reads it; Zenbu
  Account says so, to update Zenbu when a newer version saved it (`SharedBookmarksProblem`,
  `AccountMessage.syncPaused`) and to reopen it otherwise, and disables **Sync Now**
  (`waitsForUnreadableBookmarks`). The cursor is
  saved only after the history's writes finish.
- **Notes, photos, the profile photo, settings, and searches** (`AccountSyncKept.swift`,
  `AccountSyncKeptModels.swift`, `SyncedSettings.swift`). `WordNoteStorage`,
  `EncounterMediaStorage`, and `RecentSearchHistory` are actors: each posts the learner's changes
  through a `KeptChangeRelay` to the main actor, and takes the account's through `applySynced`,
  which posts nothing. `UserProfile` reports its photo through `changeObserver`. `KeptStores`
  hands them to `AccountSync`, and `KeptStores.shared` is the app's.
  - **Notes** go up whole, as a `write`, and are matched by ID in any case (new ones lowercase). A
    conflict over an edit keeps both: the account's copy replaces the note, and the learner's text
    goes up as a new note on the word, or as the same note again when the other device only moved
    it (`startedFrom`, the text the edit began from); while a later edit of it is still queued, only
    that one does, so two offline edits make one new note. A page saves with the text it showed:
    when the store's note changed underneath it, compared as the service keeps text (NFC, one kind
    of line break, other control characters as spaces), the edit is saved as a new note, unless
    it's the newer text already, and a deletion leaves the newer text. The page loads the word's
    notes again after each save, so after a split it edits the new note. A note refused `invalid_fields` or `too_many_notes` is kept from the
    account's copies, and its version from moving, until the learner changes it (`refusedNotes`).
  - **Photos.** A photo's `add`, or the profile photo's `set`, uploads its file first
    (`PUT /v1/photos/{id}`, the bytes as the Media Library or the profile keeps them). A request
    carries at most four new photo files (`filesPerRequest`), holding back every later change to
    those photos and their words, so their order holds and settings, notes, and the profile photo
    never wait behind a library; each file that went is remembered
    (`uploadedFiles`) until its change's result, so a sync cut off mid-way doesn't send it again. A
    file the account refuses (`409`, `413`, `415`) drops that change, and the photo stays on the
    device, named in `refusedPhotos` for Zenbu Account's message; one refused as too many goes
    again, with its words, at the next launch after a place frees (`photoRoomFreed`): a photo
    deletion from this device that the account applied at a new version, or one that comes down
    without `emptied` and newer than the device's copy, outside a full read when the device had no
    copy. An emptied photo keeps its place for 30 days, so it frees none, and a full account isn't
    sent the same files at every launch. A refused note or photo is never removed by a copy that
    comes down: a deletion the account still names, or the full read's drop below.
    `503` (no photo storage) holds every photo, photo word, and profile photo change for the rest
    of the sync (`filesWait`), and Zenbu Account says photos wait (`photosUnavailable`); so does `photo_not_uploaded`, which queues its change again for
    the next sync. A word rejected `unknown_photo` is queued again if its photo's change still is;
    if the account had the photo, which was then deleted elsewhere, the word is dropped on the
    device, with the photo if no other word holds it; otherwise it stays on the device. Removing a
    photo's last word sends only the word's `remove`: the account's emptied photo comes down as a
    `delete`.
  - **Downloads.** A photo or profile photo from the account uses the file the device already
    holds under its SHA-256, in the Media Library or the profile, and downloads it otherwise. A
    photo word whose photo isn't on the device waits for it (`heldPhotoWords`). A download cut off
    on the way, a `5xx`, or one the device couldn't save is tried again at the end of the next sync
    (`waitingFiles`). A `429` stops downloads for the sync (`downloadsWait`) and asks the scheduler
    for another after its `Retry-After` (`onRetryFiles`). Each download checks the session before
    it records anything, so one that arrives or fails after a sign-out or another sign-in changes
    nothing, and a new session starts with no photos on their way and no note that photos wait.
    A `404` (`not_found` or `photo_file_missing`), a `402`, or any other refusal never deletes
    anything, and waits for the next launch's first sync (`missingFiles`), so a file the account
    lost isn't asked for on every sync.
  - **Applying.** The kept copies of one answer are applied together, the latest per entity: one
    write of the notes, one of the recent searches, and one each of the Media Library's photos and
    words, each downloaded file saved on its own as it arrives (`storeFile`). Each batch
    raises `keptRevision`, which the Media Library, recent searches, Frequency Dictionaries, and a
    word's or kanji's page watch to load again, and `photosOnTheirWay` counts the photos still
    downloading or waiting, which the Media Library shows.
  - **Settings.** `SyncedSetting.all` names each setting the service lists, where the app keeps it
    in `UserDefaults`, and its standard value. `SyncedSettings` notices a change on
    `UserDefaults.didChangeNotification` and before every sync, and sends only a value it hasn't
    seen; the first upload sends those changed from their standard. `ReadingAidPreferences` and
    `TranslateExperience` follow a value written under them. Translate's layout isn't one. A
    setting refused `unknown_setting` or `invalid_fields` waits for the next launch
    (`retryNextLaunch`), and a conflict whose `current` is gone goes again at its version. Search
    results never write a fallback to Default into `search.sort`: the core shows Default while the
    chosen dictionary isn't usable, and the choice stays. The
    frequency dictionaries chosen are one setting, `frequencyDictionaries.chosen`, through
    `FrequencyChoice`: `FrequencyPackManager` tells the learner's enable, disable, reorder,
    download, and remove, and shows the account's choice in its order (`applySynced`), without
    telling. It keeps that choice in its `state.json` (`syncedChoice`) while a pack in it isn't
    downloaded, and what it tells includes those packs in their places, so a change here never
    narrows the account's choice. `FrequencyChoice.live` downloads them through
    `FrequencyPackDownloads`, so Frequency Dictionaries shows their progress and a tap never starts
    a second one, with a request that refuses cellular and Low Data Mode (`quietDownload`), and
    without marking a pack failed; each launch's first sync resumes them.
  - **Recent searches.** A search's ID is the HMAC-SHA256 of its query in NFC under the account's
    `searchKey`, which each sync answer carries and the file keeps. The store reports searches by
    their query, and `AccountSync` names them under the key; until the first answer brings it,
    nothing about searches is queued, and a removal is held by its query
    (`searchRemovalsBeforeKey`). When the key comes, or changes, the device's searches go up under
    it, each removed under the old one, with the held removals. A pulled search whose ID isn't its
    query's is left out. A search never starts a sync: it goes with the next one. A removed or
    pruned search's version is kept for the latest 100 (`goneSearches`), as videos' are.
- **Favorites** has one ID in every app ([`account-client-rules.md`](account-client-rules.md),
  Study data). A second phone's `create` of it is rejected `already_exists`, which the first upload
  never undoes: the account's copy comes down, and the phone's words still add. If that copy comes
  down deleted (`accountHadFavorites`), the phone keeps its list under a new ID and uploads it with
  its words. Any other list the account deleted is deleted on the phone. A list screen open on
  the old ID follows the list: `WordLists.moveList` records each move, and `WordListView` reads
  its list through `WordLists.currentID(of:)`.
- **List order.** Lists sort by position, then by `createdAt`, then by ID, and a pulled list takes
  the account's `createdAt`, so lists that share a position, as when a first upload sends one into
  a place the account already used, show in the same order on every device.
- **A sync** sends up to 50 queued changes, at most 48 KB of them (the service takes 64 KB), and at
  most one per entity, so a second change to an entity goes after the first's result and is moved
  onto its version. An answer lost on the way is sent again unchanged. `applied` keeps the version;
  `conflict` takes `current`; `rejected` undoes the change with what it recorded (a word's earlier
  status, a list's earlier name), unless a later change to the entity is queued, and never undoes
  the first upload, so a list the account already has stays. A pulled copy of an entity with a
  change still queued is held in the file (`deferred`) until that change's result: a conflict's
  `current` replaces it, an applied result takes it only at the same version (the change changed
  nothing, so no newer copy comes), and a rejected one takes it. A list word whose list hasn't
  arrived is kept in the file until a sync reaches `hasMore: false`, even across a failed page or a
  relaunch, then dropped if the list never came. A deleted list drops its words. Every read from
  no cursor (the first after signing in, a catch-up, or after a `410`) is a full read: the keys
  it brings or sends are kept in the file (`rereadSeen`), across a failed page or a relaunch, and
  once it reaches `hasMore: false`, each note, photo, and photo word the device holds a version
  for that it didn't bring, send, or have queued is removed on the device with its version, since
  the account forgot it (`SyncEntity.forgotten`, as the client guide's step 5 says). Nothing else
  is dropped, so a restore and a later `410` can't take known words, lists, or bookmarks added
  since. `410` drops the cursor and the held copies and words, and starts a full read,
  still sending the queue; a `410` during a full read starts it again only after the network
  backoff, with Zenbu Account saying the account is being read again, so it can't loop. A sync's
  answer is dropped if the learner signed out or in while it was on the way.
- **When.** `AccountSyncScheduler` syncs a second after a local change, on becoming active (once the
  files have loaded) when changes are queued or the last sync is over 15 minutes old, in a
  `BGAppRefreshTask` (`com.zenbujapanese.dictionary.account-sync`, scheduled 15 minutes out on going
  to the background, and stopped when iOS ends it), and on **Sync Now**. Never on a timer. A network
  failure, `5xx`, or a `410` during a full read waits 2 seconds, doubling up to 5 minutes, at half to all of that at random, and
  retries by itself at most 10 times, only in the foreground; a local change or becoming active
  waits it out too, and **Sync Now** doesn't. `429` waits what `Retry-After` says, whatever starts
  the sync. `402` (not subscribed), from the sync or a photo's upload, keeps every change queued
  and waits for the next change, launch, or **Sync Now**: it's never tried again by itself.
- **Deleting** signs in again first (Apple when `GET /v1/auth/list-accounts` lists it, keeping the
  authorization code), refuses a sign-in to another account, and signs out the session the new
  sign-in replaces. Then it calls `DELETE /v1/me` and signs out. Each attempt with Apple uses a new
  code. If the answer is lost, the app asks `/v1/auth/token`: a `401` means the account is gone.

`AccountSignInTests`, `AccountSyncTests`, `AccountSyncConflictTests`, `AccountSyncRecoveryTests`,
`AccountSyncFullReadTests`, `AccountSyncWatchHistoryTests`, `AccountSyncBookmarkTests`, `AccountSyncProfileTests`,
`AccountSyncKeptTests`, `AccountSyncPhotoTests`, and `AccountSignedOutTests` run the client
against a stub server (`StubAccountServer`, a `URLProtocol`):
sign-in, tokens and their refresh, the queue and cursor across a relaunch, retries under the same
mutation IDs, each entity's conflicts and rejections, order and paging, list words held across a
failed page, the request size, `410` and full reads dropping only what the account forgets, even
when cut off, and waiting rather than looping on a `410` within one, `429` and backoff, and signing out and deleting, which keep
the phone's data. `AccountSignedOutTests` runs against `FakeAccountService`, a small copy of the
service's sync rules (`FakeAccountService+Kept.swift` holds the six newer entities', with emptied
photos and their `emptied` mark, the search key, the two kinds of `404`, pages, and `410` once it
forgets above a cursor's floor, as the service does), so two installs can share one account: changes made while signed out going to
the same account, another account starting over, and two phones ending with one Favorites.
`AccountSyncWatchHistoryTests` covers Recent's first upload, a newer watch replacing an unsent one,
pulled videos kept to the newest 50, removals both ways, a watch that lost to a removal, a rejected
watch, a phone catching up on watch history, a service that doesn't know watch history yet, old
videos' dates, the kept versions' bound, bad pulled IDs, and two phones through
`FakeAccountService`. `AccountSyncBookmarkTests` covers the first upload sending each bookmarked
sentence and nothing else said, the queue, a bookmark from another device listed on its own and
removed, an un-bookmark that lost to a newer bookmark, a rejected bookmark, deleting a conversation,
an unreadable synced bookmarks file pausing sync, a pulled ID that isn't its change's, a service
that doesn't know bookmarks yet, catching up, and two phones. `AccountSyncKeptTests` covers the
first upload of notes, photos, the profile photo, settings, and searches; a note on two phones,
and two edits of one kept as two notes; a setting's first change winning, with Translate's layout
left alone; searches on two phones, their IDs against the service's own example, waiting for the
key and a new key; the frequency dictionaries' choice; and a `402`. `AccountSyncPhotoTests` covers
a file going up before its photo, the last word's removal and a word that brings the photo back,
a deletion dropping a word added since, a lost file and a `402` download waiting for the next
launch, a held image never downloaded, a refused file, no photo storage, `photo_not_uploaded`,
and the profile photo on two phones, in either order, filling an account whose photo was removed,
and not going to another account. `AccountSyncNoteTests` covers a deletion losing to an edit, a
refused note kept through a pull, two offline edits, a stale page's edit, and a page's deletion
across the synced copy; `WordNoteBatchTests`, one write for a whole answer.
`AccountSyncFileTests` covers refused files and their messages, downloads retried after a cut,
a `5xx`, a `429`, or a failed save, an upload's `429`, a cut-off upload, the file cap per
request, and a download across another sign-in. `AccountSyncRulesTests` covers settings apart,
refused, and conflicting with a gap; searches removed against a stale search, pruned, removed
before the key, and riding along; and the first upload across a sign-out. `PlatformAdapterTests`
shows a photo from Files losing its metadata. `SyncedSettingsTests` shows Reading Aids and Translate's
speech speed following a synced value, and `FrequencyPackLifecycleTests` the manager showing a
synced choice and telling only the learner's. On iPhone and iPad,
`AccountSignedInUITests.testSigningInBringsThePhotoSettingsAndSearchesKeptOnAnotherDevice` signs
in to the stand-in service with `ZENBU_ACCOUNT_STAND_IN_KEPT=1`, whose first answer brings a
photo on a word, Reading Aids' romaji, and a recent search, and finds each where the learner
would. `AccountAuditUITests` signs in the same way to audit the Media Library with that photo,
the signed-in Profile, and Zenbu Account, and, after saving a photo on a word, with
`ZENBU_ACCOUNT_STAND_IN_REFUSES=too_many_photos` or `photos_unavailable`, which answers the photo's
upload `409` or `503`, Zenbu Account's notes for a photo refused as too many and for photos
waiting for storage.
