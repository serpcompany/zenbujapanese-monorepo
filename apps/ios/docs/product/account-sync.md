# Zenbu account and sync

A learner can sign in to their Zenbu account from Account, to keep their known words and lists the
same on every device and Zenbu app they sign in to (#573), and the same on every device running
this app (#867): Player's Recent videos and Translate's bookmarked sentences
([Player](player.md#opening-a-video), [Translate](translate.md#translations)), word notes, Notes
Without a Word included, the Media Library's photos and the words each is on, settings, the
frequency dictionaries chosen, and recent searches ([Saved data](saved-data.md)). The profile's
name and username are the same as the account's page on the website shows, and its photo the same
on every device running this app ([Account](index.md#account)). Zenbu works the same signed out and offline: everything stays on
the phone, and the phone's copy is what the app shows.

Check: package `AccountSyncTests`, `AccountSyncConflictTests`, `AccountSyncRecoveryTests`,
`AccountSignedOutTests`, `AccountSyncWatchHistoryTests`, `AccountSyncBookmarkTests`,
`AccountSyncProfileTests`, `AccountSyncKeptTests`, `AccountSyncPhotoTests`, `AccountSyncNoteTests`,
`AccountSyncFileTests`, and `AccountSyncRulesTests`, against a stand-in account service; `SyncedSettingsTests` and `FrequencyPackLifecycleTests` (a synced setting or
choice reaching what shows it); UI `AccountUITests` (offline).

What stays on each device on purpose:

- **Translate conversations**, which hold other people's words: only the sentences the learner
  bookmarks sync, each on its own.
- **Translate's layout**, cards or a list, which suits each device's screen. Its speech speed syncs.
- **Downloaded dictionaries and language packs**: each device downloads its own. The frequency
  dictionaries the learner chose sync, and a device downloads the ones it lacks.
- **The email typed while signed out**, which is this phone's own.
- **How each screen is left**: the camera's flash, and which sections of the grade and radical
  pickers are closed, which suit each device.

**Signing in.** **Sign In to Sync** opens a sheet with **Sign in with Apple**, **Sign in with
Google** (in builds given a Google client ID, which every build is), and an emailed code: the learner enters their
email, taps **Email Me a Code**, and enters the 6-digit code. A refused sign-in says why, such as a
wrong or expired code, or an email whose account signs in with Apple or Google. Sign in with Apple
asks for the learner's name and email; a new account takes the name Apple shares on the first
sign-in, which the website's account page shows and lets the learner change. Signed in, the
Account row shows **Zenbu Account** and the email.

Check: package `AccountProviderSignInTests` (Apple's and Google's sign-in, with only their sheets
stood in: the nonce, PKCE, the token exchange, the account's answer, and the session; a closed
sheet; a refused token) and `AccountSignInTests` (emailed codes, tokens, refused sign-ins); UI
`AccountUITests.testSignInOffersAppleGoogleAndACodeAndSaysWhenTheServiceCantBeReached` and
`AccountSignedInUITests.testSigningInWithAppleShowsTheZenbuAccountAndSyncs` (iPhone and iPad,
with the account service and Apple's sheet stood in, and the session kept in the Keychain across a
relaunch, which only the app can do: a package test process has no keychain access group). A real Apple or Google sign-in is by hand ([Account manual checks](../../../../docs/agents/ios.md#account-manual-checks)).

**The first sync.** When this phone signs in to an account other than the one it last signed out
of, the app sends the account everything on the phone: every known word, every list, every list's
words, Recent's videos, bookmarked sentences, notes, photos with their words (each photo's file
first), the profile photo, each setting changed from its standard, and the frequency dictionaries
chosen if they aren't the standard ones, then brings down everything the account already has.
Recent searches go up once the account's first answer brings the key their IDs are made with, and
a search removed before then is removed from the account too. The first sync gathers all of it,
so the sign-in sheet closes at once, and a phone that's closed or signed out before that sync
sends it at the next one. A phone that signed in before the app synced any of these sends them
once, after updating. The same Apple ID, Google account, or email reaches the same account in
every app.

**The profile at sign-in.** Each time the phone signs in, it reads the account's name and username,
and the account's wins over the phone's for each it has. One the account has empty is filled from
the phone and sent up, unless the phone signed out of another account: then the phone takes the new
account's as they are. Until the read succeeds, profile edits wait on the phone. A name or username
the account can't take (an empty name, one with control characters, or a username an earlier version
saved that the rule refuses) stays on the phone without going up.

Check: package `AccountSyncTests` and `AccountSignedOutTests` (the first sync, and catching up on
watch history and bookmarks); `AccountSyncKeptTests` (the first sync of notes, photos, the profile
photo, settings, and searches); `AccountSyncProfileTests` (the profile at sign-in).

**Favorites is one list.** Every device's and app's Favorites is the same list in the account, so
signing in on a second phone puts that phone's Favorites words into the account's Favorites, under
its name and place, rather than making a second Favorites. An install that already had Favorites
before it could sign in joins it the same way, if its oldest list is still named Favorites. If
Favorites was deleted in the account, a phone signing in keeps its own Favorites, with its words,
as a new list.

Check: package `AccountSignedOutTests`.

**When it syncs.** After each change to a known word, a list, Recent, a bookmark, a note, a photo or
its words, a setting, or the profile (a search goes with the next sync, rather than starting
one), when the app opens or returns to
the foreground with changes waiting or a last sync over 15 minutes ago, when iOS gives it time in
the background, and when the learner taps **Sync Now** on Zenbu Account. Never on a timer. Offline,
changes wait on the phone, in order, across relaunches, and go when it's back; a failed sync tries
again a few times, waiting longer each time, only while the app is open. A sync the account
answers as not subscribed (`402`), for the sync or for a photo's file going up or coming down,
keeps every change and photo on the phone, says syncing needs a subscription, and isn't tried
again until the next change, launch, or **Sync Now**.

Check: package `AccountSyncTests`, `AccountSyncRecoveryTests`, `AccountSyncKeptTests` (a `402`),
and `AccountSyncPhotoTests` (a `402` download); UI
`SubscriptionUITests.testAPhotoSavedWithoutASubscriptionStaysOnTheDeviceWhileSyncingWaitsForOne`
(iPhone and iPad).

**When the same thing changed elsewhere.** Each kind of change follows the account's rule
([`docs/agents/account-client-rules.md`](../../../../docs/agents/account-client-rules.md)):

- A known word marked or un-marked on another device first shows as it is there, for the learner
  to change again: an un-mark made before this phone saw a newer mark shows the word Known again.
- A list renamed or moved elsewhere first keeps the other name or place.
- A list deleted anywhere is deleted here with its words, whatever was done to it since. The one
  exception is Favorites on a phone signing in to an account whose Favorites was deleted before
  (above).
- A word added to a list elsewhere stays, even if this phone removed it without seeing that add.
- A change the account can never take, such as a word added to a list deleted elsewhere, is undone
  on the phone.
- A video watched on two devices keeps the place from the device that watched it last, by each
  device's clock, even when the other syncs later. A
  video removed from Recent on one device is removed everywhere, even if another device, which
  hadn't heard of the removal, updated its place since; watching it again brings it back.
- The account keeps the 50 most recently watched videos, as Recent does; a video watched on
  another device that pushes one past 50 removes it here too.
- A sentence un-bookmarked on one device is un-bookmarked everywhere, unless another device
  bookmarked it again since without this one hearing; then it stays bookmarked. The account holds
  at most 2,000 bookmarks; past that, a new bookmark is taken back off, and bookmarks a first sync
  can't fit stay on the phone without syncing.
- When the website changed the name or username before the app synced its own edit of either, the
  app's edit gives way, and the profile shows as the website has it. One the account refuses, such
  as a username someone else has, goes back on the phone, and Profile says why until the next edit.
- A note edited on two devices keeps both: the edit that syncs second becomes a new note on the
  same word, and a note edited twice before it synced becomes one new note, its latest text. An
  edit made on a page that was open while a sync changed the note becomes a note of its own beside
  the newer text, unless it's the same text, and an open page shows what arrived. A note deleted on one device stays on another
  that edited it since. A note the account refuses, such as one over 10,000 characters, stays on
  the phone untouched, even when the account's copy of it comes down, until the learner changes it.
- A photo goes up with its file before the change that names it, and another device downloads
  the file once; a device that already holds the same image shows it without downloading. Removing
  a photo's last word removes it everywhere, but a word added on a device that hadn't seen that
  brings it back to every device. Deleting a photo in the Media Library deletes it and its words
  everywhere, and a word added to it elsewhere since is dropped. A file the account refuses (over
  12 MB, not an image it takes, or past 1,000 photos) stays on the phone with its words, without
  syncing, and Zenbu Account says how many and why; one past 1,000 goes again the next time the
  app opens after a photo the account held is deleted, here or on another device. Removing a
  photo's last word frees no place: the account keeps it for 30 days. While the account has no
  photo storage, photos and their words wait, Zenbu Account
  says so, and the rest syncs. Files go up a few at a time beside everything else, and one cut off
  goes again without the ones before it. A file the account can't send never deletes the photo:
  it's tried again the next time the app opens. One it won't send while it isn't subscribed comes
  at the first sync after subscribing. One cut off,
  answered 5xx, or that the phone can't save yet is tried at the next sync, and one answered 429
  after the seconds it says. The Media Library says how many photos are on their way, and shows
  each as it arrives.
- The profile photo set or removed on one device shows the same on the others; of two changes,
  the one that syncs second gives way. A first sync fills an account whose photo was removed from
  the phone's, and signing in to a different account never gives it the last account's photo.
- A setting changed on two devices takes the first to sync, and the other device shows it. Each
  setting is its own, so changing furigana on one device never undoes the speech speed set on
  another. One the account refuses stays on the phone and goes again the next time the app
  opens. A sort by a frequency dictionary this phone hasn't downloaded yet shows as Default and
  keeps the choice. Frequency dictionaries chosen on another device download on their own, with
  their progress in Frequency Dictionaries, never on cellular or in Low Data Mode, and are tried
  again the next time the app opens if they couldn't.
- A search on two devices is one search, kept at its later time. A search removed on one device is
  removed everywhere, even from a device that searched it again without having heard of the
  removal; searching it after that brings it back. The account keeps the latest 50.
- A device away longer than the account remembers a deletion (its latest 1,000 deleted notes or
  photos, or a photo's latest 500 removed words) reads everything again at its next sync, then
  removes here the notes, photos, and their words the account no longer has. A sign-in or a
  catch-up that reads from the start does the same. What the device changed meanwhile still goes,
  a note or photo the account refused stays, and nothing else is removed this way: not known
  words, lists, Recent, bookmarks, searches, settings, or the profile. If the account forgets more
  while the device reads, the sync stops, Zenbu Account says it's reading the account again, and
  it tries again after a wait.

Check: package `AccountSyncConflictTests`, `AccountSyncWatchHistoryTests`,
`AccountSyncBookmarkTests`, `AccountSyncProfileTests`, `AccountSyncKeptTests`,
`AccountSyncPhotoTests`, and `AccountSyncFullReadTests` (reading everything again); UI
`AccountSignedInUITests.testSigningInBringsThePhotoSettingsAndSearchesKeptOnAnotherDevice` (iPhone
and iPad: a photo, Reading Aids' romaji, and a recent search from the stand-in account show after
signing in).

**Zenbu Account** shows the email, when the last sync was (or that one is running), how many changes
are waiting (not counting profile edits waiting for the profile to be read), and a note when the
last sync failed, with **Sync Now**, **Sign Out**, and **Delete Account…**. If the bookmarks synced
from other devices can't be read at launch, such as before the device's first unlock, nothing syncs
until Zenbu is reopened, so none are lost, and Zenbu Account says so; if a newer version of Zenbu
saved them, nothing syncs until Zenbu is updated, and Zenbu Account says to update it.

Check: package `AccountSyncTests`, `AccountSyncRecoveryTests`, and `AccountSyncBookmarkTests`
(the unreadable and newer bookmarks messages); UI
`AccountSignedInUITests.testSigningInWithAppleShowsTheZenbuAccountAndSyncs` (iPhone and iPad:
the email, Sync Now, and the last sync).

**Signing out** asks first, then forgets the sign-in on this phone and keeps everything: the
profile, known words, lists, Recent, Translations, notes, and media stay, and every feature works. Changes made while signed out, such
as an un-marked word, a deleted list, a removed word, or a rename, are kept in order (each word,
list word, and list as just its latest change), and go to the account when the learner signs in to
the same account again, by the account's rules: a change made elsewhere first wins, and the
profile follows its sign-in rule (above). Signing in to a different account instead sends that
account everything on the phone, as a first sync does, except the profile. If the account ends the session itself, such as after the account is deleted
from another app, the app signs out the same way, and the Account row says so.

Check: package `AccountSignedOutTests` and `AccountSignInTests` (a session the service ended); UI
`AccountSignedInUITests.testSigningOutAsksFirstAndKeepsTheLearnersWords` (iPhone and iPad).

## The subscription

Syncing can need a subscription (#868); everything on the device stays free. Until the owner turns
it on at the service, every account syncs as before, and the app shows no subscription.

- **Zenbu Account → Subscription** shows each subscription still running, with where it was bought
  (App Store or zenbujapanese.com), its status (active, ends or renews on a date, payment failed,
  paused, waiting for payment), and how to manage it: **Manage in the App Store** opens the App
  Store's subscription settings (a sheet on iPhone and iPad, the App Store's page on the Mac), and
  says the Apple Account that bought it manages it; one bought on the website says it's managed
  there, with no link, and a failed website payment says only that it failed. Paying in both shows
  both, and says to cancel one. An ended or refunded one shows its status.
- **Subscribe to Sync…** appears only when sync needs a subscription and the account has none
  running anywhere, nor the Apple Account, so no one is offered a second or one sync doesn't need.
  Opening the paywall and buying check again first. The paywall says what syncs (known words,
  lists, notes, photos, the profile photo, settings, recent lookups, watch history, and bookmarked
  translations) and that the rest stays free, the name and username included, lists each
  plan with its name, price, and period from the App Store, with a free trial or introductory price
  when the Apple Account may have one, and has the renewal terms, **Restore Purchases**, **Terms of
  Use**, and **Privacy Policy**. A purchase belongs to the signed-in account; one waiting for Ask to
  Buy says so, across a relaunch, for a day or until it's approved or the learner tries again. If
  the Apple Account's subscription belongs to another Zenbu account, the app says to sign in to
  that one until the learner signs out or the Apple Account has none. The app buys only after
  reading the account's subscription again, and says so when it can't. When nothing is offered
  the paywall says why, and an App Store that doesn't sell the plans, or an Apple Account with
  nothing to restore, says so; VoiceOver reads each of these notes once, as it appears.
- **When sync needs a subscription**, the Account row says so, Zenbu Account says the changes stay
  on the device and sync once the learner subscribes, and nothing queued is lost; a payment being
  retried, a paused subscription, and a first payment still to come each say that instead. The app
  sends no sync the service would refuse, but the profile's name and username, which stay free,
  still sync; its photo waits with the rest.
  Subscribing syncs at once, and so does **Sync Now** after a purchase on the website, since it
  reads the subscription first.
- **Restore Purchases** asks the App Store for the Apple Account's purchases and sends them; signing
  in sends them too, so an earlier subscription unlocks the account.

Check: package `AccountSubscriptionTests` (the purchase and its token, no offer while sync is free
or another subscription runs, reading again before buying, a service that's down, another
account's purchase, Ask to Buy, a store that sells none, restoring with and without a purchase,
signing in, a purchase handed over twice, buying only on a fresh read, and a purchase's answer over
an older read), `AccountSubscriptionStateTests` (the answer kept per account, switching accounts,
late answers, a relaunch, signed out, no refused sync but the profile, Sync Now, a refused sync,
unknown values, and deletion's answer), `AccountSubscriptionNotesTests` (each note's life, why
nothing is offered, and VoiceOver), and `SubscriptionTextTests` (each state's words); `StoreKitPurchasesTests` (iPhone, iPad, and the Mac, against StoreKit with the StoreKit
configuration file: the plans and an introductory offer, a purchase carrying the account's token,
current purchases, one made outside the app, Ask to Buy and its approval, a refund, a renewal, an
expiry, and syncing with the App Store); UI `SubscriptionUITests` (iPhone and iPad: buying unlocks
sync and offers no second, a website subscription and a failed website payment, sync waiting for an
App Store payment, paying in both, an ending one and Manage, and deleting with an App Store one);
`AccountAuditUITests` audits the paywall, the section with none, an App Store one, a website one,
both, a payment retried, and a first payment pending, and deleting with an App Store one.

## Deleting the account

A signed-in learner can delete their Zenbu account from **Zenbu Account → Delete Account…**
(#574, App Review guideline 5.1.1(v)):

- The sheet says what goes (the account, its ways to sign in, and everything it synced, on every
  device and app) and that this phone keeps its data. **Delete Account…** asks to confirm.
- The learner signs in again: with **Sign in with Apple** if the account uses Apple, otherwise with
  Google or an emailed code to the account's email. Signing in to a different account deletes
  nothing. A development build (Zenbu Dev) can't sign in with Apple, so for an account that uses
  Apple it says to delete it from the App Store or TestFlight app.
- The account and everything it synced are then deleted through the account service
  ([`docs/agents/account-clients.md`](../../../../docs/agents/account-clients.md), Deleting the
  account). If Apple refuses or doesn't answer, nothing is deleted, and the learner signs in with
  Apple again to try again.
- An App Store subscription doesn't end with the account: the sheet says so before and after, with
  **Manage in the App Store**, since Apple keeps billing until the learner cancels it. One bought on
  the website is canceled with the account.
- Afterwards the app is signed out and keeps everything on the phone: Known Words, lists,
  Recent, Translations and their bookmarks, notes, and media stay, and every feature works. Signing in again makes a new account, which gets
  everything on the phone, as a first sync does.

Check: package `AccountSyncTests` and `AccountSyncRecoveryTests` (signing in again, a refused or
lost deletion, and the phone keeping its data) and `AccountSignedOutTests` (starting over); UI
`AccountSignedInUITests.testDeletingTheAccountSignsInAgainThenLeavesTheAppSignedOut` and
`SubscriptionUITests.testDeletingWithAnAppStoreSubscriptionSaysAppleKeepsBillingForIt` (iPhone and
iPad).
