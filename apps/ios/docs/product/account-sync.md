# Zenbu account and sync

A learner can sign in to their Zenbu account from Account, to keep their known words and lists the
same on every device and Zenbu app they sign in to (#573), and Player's Recent videos and
Translate's bookmarked sentences the same on every device running this app
([Player](player.md#opening-a-video), [Translate](translate.md#translations)), and the profile's
name and username the same as the account's page on the website shows
([Account](index.md#account)). Zenbu works the same signed out and offline: everything stays on
the phone, and the phone's copy is what the app shows.

Check: package `AccountSyncTests`, `AccountSyncConflictTests`, `AccountSyncRecoveryTests`,
`AccountSignedOutTests`, `AccountSyncWatchHistoryTests`, `AccountSyncBookmarkTests`, and
`AccountSyncProfileTests`, against a stand-in account service; UI `AccountUITests` (offline).

What doesn't sync, and why:

- **Word notes**, which the account service doesn't hold yet (it answers a note `unknown_entity`),
  keyed by Language Reference ID but for those an earlier version saved that no word took.
- **Media Library photos**, which need file storage the account service doesn't have.
- **Translate conversations**, which hold other people's words: only the sentences the learner
  bookmarks sync, each on its own.
- **Settings**, such as Reading Aids, which stay with each device.
- **The profile's photo, and the email typed while signed out**, which are this phone's own.

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
words, Recent's videos, and bookmarked sentences, then brings down everything the account already
has. A phone that signed in before the app synced watch history or bookmarks sends them once, after
updating. The same Apple ID, Google account, or email reaches the same
account in every app.

**The profile at sign-in.** Each time the phone signs in, it reads the account's name and username,
and the account's wins over the phone's for each it has. One the account has empty is filled from
the phone and sent up, unless the phone signed out of another account: then the phone takes the new
account's as they are. Until the read succeeds, profile edits wait on the phone. A name or username
the account can't take (an empty name, one with control characters, or a username an earlier version
saved that the rule refuses) stays on the phone without going up.

Check: package `AccountSyncTests` and `AccountSignedOutTests` (the first sync, and catching up on
watch history and bookmarks); `AccountSyncProfileTests` (the profile at sign-in).

**Favorites is one list.** Every device's and app's Favorites is the same list in the account, so
signing in on a second phone puts that phone's Favorites words into the account's Favorites, under
its name and place, rather than making a second Favorites. An install that already had Favorites
before it could sign in joins it the same way, if its oldest list is still named Favorites. If
Favorites was deleted in the account, a phone signing in keeps its own Favorites, with its words,
as a new list.

Check: package `AccountSignedOutTests`.

**When it syncs.** After each change to a known word, a list, Recent, a bookmark, or the profile's
name or username, when the app opens or returns to
the foreground with changes waiting or a last sync over 15 minutes ago, when iOS gives it time in
the background, and when the learner taps **Sync Now** on Zenbu Account. Never on a timer. Offline,
changes wait on the phone, in order, across relaunches, and go when it's back; a failed sync tries
again a few times, waiting longer each time, only while the app is open.

Check: package `AccountSyncTests` and `AccountSyncRecoveryTests`.

**When the same thing changed elsewhere.** Each kind of change follows the account's rule
([`docs/agents/account-clients.md`](../../../../docs/agents/account-clients.md), The rules):

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

Check: package `AccountSyncConflictTests`, `AccountSyncWatchHistoryTests`,
`AccountSyncBookmarkTests`, and `AccountSyncProfileTests`.

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
  Store's subscription settings (a sheet on iPhone and iPad, the App Store's page on the Mac); one
  bought on the website says it's managed there, with no link. Paying in both shows both, and says
  so. An ended or refunded one shows its status.
- **Subscribe to Sync…** appears only when the account has no subscription running anywhere, so no
  one is offered a second. The paywall says what syncs and that the rest stays free, lists each
  plan with its name, price, and period from the App Store, with a free trial or introductory price
  when the Apple Account may have one, and has the renewal terms, **Restore Purchases**, **Terms of
  Use**, and **Privacy Policy**. A purchase belongs to the signed-in account; one waiting for Ask to
  Buy says so, and unlocks once approved. If the Apple Account's subscription belongs to another
  Zenbu account, the app says to sign in to that one.
- **When sync needs a subscription**, the Account row says so, Zenbu Account says the changes stay
  on the device and sync once the learner subscribes, and nothing queued is lost. Subscribing syncs
  at once.
- **Restore Purchases** asks the App Store for the Apple Account's purchases and sends them; signing
  in sends them too, so an earlier subscription unlocks the account.

Check: package `AccountSubscriptionTests` (the answer kept per account, the purchase and its token,
no second offer, a service that's down, another account's purchase, Ask to Buy, restoring, signing
in, signed out, a refused sync, unknown values, and deletion's answer); `StoreKitPurchasesTests`
(iPhone, iPad, and the Mac, against StoreKit with the StoreKit configuration file: the plans and an
introductory offer, a purchase carrying the account's token, current purchases, one made outside
the app, Ask to Buy); UI `SubscriptionUITests` (iPhone and iPad: buying unlocks sync and offers no
second, a website subscription, and deleting with an App Store one).

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
