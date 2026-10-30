# Account

The side panel's Account tab ([`side-panel.md`](side-panel.md)) and Settings' Account page
([`settings.md`](settings.md)) draw one account component, `AccountView` in `src/account/`, so
both show the same account, and signing in or out on either shows on both
(`src/settings/settings-page.interaction.test.tsx`, "shows the same account as the side panel's
Account tab…"; `e2e/account.spec.ts`, the emailed code). The text is in `src/account/labels.ts`.
Each check is in `src/account/account-view.interaction.test.tsx` unless it names another;
`e2e/account.spec.ts` signs in against the account service from the checkout
([`extension-browser-tests.md`](../../../../docs/agents/extension-browser-tests.md)).

## Signed out

| What a learner sees | Check |
| --- | --- |
| "Not signed in", that a Zenbu account keeps known words, lists and notes on all devices, then Continue with zenbujapanese.com, "or", Email and Send Code, "or", Continue with Google, and Continue with Apple. | `says Not signed in and offers an emailed code, Google, and Apple`; `offers zenbujapanese.com first…` |
| Continue with zenbujapanese.com opens the website's `/account/extension/` page in a new tab. Its Sign in to the extension hands the extension a code, and the account shows here with no more steps. Only the build's own website can hand one over: zenbujapanese.com, or staging's in a staging build. A browser signed in already keeps its account. Deleting the account never offers this way: it asks for a fresh sign-in here. | `offers zenbujapanese.com first, and shows the account once the website hands over a code`; `warns that an App Store subscription goes on…`; `src/service-worker/account/website-sign-in.test.ts`; `channel.test.ts`, "signs in with a code only the website's own origin hands over"; `e2e/website-sign-in.spec.ts` |
| Send Code: "We sent a 6-digit code to" the email, "It works for 10 minutes.", a Code field, Sign In, Send a New Code, and Use Another Email. | `signs in with an emailed code, then shows the email and the subscription, never the profile`; `e2e/account.spec.ts`, the emailed code |
| Continue with Google and Continue with Apple open the provider's own sign-in in a Chrome window, and the account shows once it closes. Apple's answer comes back through the account service's return route. | `signs in with Google, and after signing out, with Apple`; `e2e/account.spec.ts`, Google and Apple through the stand-ins |
| No Continue with Google in a build without the extension's Google client: the release builds, until #987 sets it up. | `offers no Google sign-in in a build without a Google client` |
| A message sits by what it belongs to, never in a toast: a code's under its field, Google's or Apple's under their buttons. Too many tries says how many seconds to wait; a wrong code, one that ran out, a code for an email whose account signs in with Google or Apple, Google or Apple for an email whose account signs in another way, such as an emailed code, a closed sign-in window, and a failed call each say what to do. | `says how long to wait when codes are asked for too often, and when a code is wrong`; `says so under Google and Apple when the learner closes the Google window…`; the refusals in `src/service-worker/account/sign-in.test.ts`, and "tells a learner whose email has an account another way in…" |

## Signed in

| What a learner sees | Check |
| --- | --- |
| The email, then Subscription, Manage Account, Sign Out, and Delete Account. Never the profile: no name or photo, and nothing to edit. Manage Account says the name and the ways to sign in change on zenbujapanese.com, and opens its `/account/` page in a new tab. | `signs in with an emailed code, then shows the email and the subscription, never the profile`; `links Subscribe… and Manage Account to the account page…` |
| Subscription: "Not checked yet" until the service answers, then "No subscription" with Subscribe…, "Subscribed, renews" or "ends" a date with Manage Subscription, a payment that didn't go through, or, for the App Store, that it is managed in the Apple Account's subscriptions, with no link. Subscribe… and Manage Subscription open zenbujapanese.com's `/account/` page in a new tab, and coming back to the panel or Settings reads the subscription again, each time until the service answers. | `src/account/subscription.test.ts`; `account-service.test.ts`, "reads the subscription again…" and "keeps reading the subscription…"; `links Subscribe… and Manage Account…`; `says an App Store subscription is managed in the App Store…`; `e2e/account.spec.ts`, Subscribe… |
| Sign Out ends this browser's session on the service and shows "Not signed in"; the learner's other devices stay signed in. | `src/service-worker/account/account-service.test.ts`, "ends the session on the service…"; `e2e/account.spec.ts`, Google and Apple |
| A session the service has ended, signed out elsewhere or its account deleted, shows "Not signed in" when the panel or Settings next opens the account, or comes back into view: with no access token kept that hasn't run out, opening asks the service for one, once. | `src/service-worker/account/account-service.test.ts`, "asks for an access token once when the account opens without one…"; `e2e/account.spec.ts`, a session the service has ended |
| Each line shows in full, wrapping rather than cut short, down to the side panel's narrowest, 360 pixels. | `e2e/account.spec.ts`, at the side panel's narrowest |
| Delete Account asks first, in a dialog that says what deleting removes and that an App Store subscription goes on billing, or that a website one ends. Keep My Account keeps it. Delete My Account asks for a fresh sign-in to the same account, then deletes it, says so, and shows "Not signed in". For an account that signs in with Apple, Continue with Apple signs in with Apple once more, so the delete goes with a fresh session and Apple's code; when Apple gives no code, it deletes nothing and says to continue with Apple again. A sign-in to another account deletes nothing, and a delete that doesn't finish keeps the subscription shown. A delete whose answer is lost says to try again and keeps the account shown. Trying again first asks the service whether the kept session is still good, before Send Code emails a code or a sign-in starts: when the delete had gone through and the session is gone, it shows "Not signed in", with no code sent and no sign-in, so no new account is made; while the session is good, it signs in afresh and deletes as before. | `warns that an App Store subscription goes on…`; `asks for Apple when the service needs Apple…`; `deletes nothing when the fresh sign-in is to another account`; `shows Not signed in, with no code sent and no sign-in, when a retried delete had gone through`; `signs in afresh and deletes when a retried delete finds the session still good`; `account-service.test.ts`, "signs in with Apple again…", "asks to continue with Apple again…", "keeps the account's subscription through the fresh sign-in…", "never takes a lost answer to a delete for done…", "ends a retried delete that went through at Not signed in…", and "signs in afresh and deletes on a retry…"; `e2e/account.spec.ts`, deleting an email account |

## In step with the account

The extension keeps its own copy of the account's known words and kanji, lists with Favorites,
the words in each list, and notes, with the changes not yet synced, in IndexedDB on the
extension's own origin; only the service worker opens it (`src/service-worker/copy/`). The ••• menus
save words to it ([`word-popup.md`](word-popup.md), Its actions), and it holds what the account
syncs. Each check is in
`src/service-worker/copy/` unless it names another; `e2e/account-sync.spec.ts` syncs with the
account service from the checkout.

| What happens | Check |
| --- | --- |
| A change goes into the copy at once and syncs right after, and what changed on the learner's other devices comes down with it. Words, kanji, a list with a word, a note, and the synced settings changed in one browser reach a second browser signed in to the same account, and a change made there comes back. | `copy-changes.test.ts`; `sync.test.ts`; `e2e/account-sync.spec.ts`, words, kanji, a list with a word |
| It syncs after a change, when Chrome starts, when the side panel opens or comes back into view with changes waiting or no sync for 15 minutes, when cloud access comes back, and on Sync Now. Nothing syncs on a timer. | `copy-owner.test.ts`, "when it syncs"; `src/side-panel/sync-when-opened.interaction.test.tsx` |
| Furigana, Romaji, Word Meanings, Translations, no furigana over known words, and the chosen frequency dictionaries go to the account; on a first sign-in, only those changed from their defaults, and the account's win. The translation language and source come down from the account and are never sent. Underlines, the sites Zenbu is off on, and the rest stay in this browser. | `settings-sync.test.ts`; `e2e/account-sync.spec.ts`, the translation language and source |
| The account wins a conflict. A note changed here and elsewhere keeps both notes. | `sync.test.ts` |
| Signing out keeps the copy and its waiting changes, and signing in to the same account sends them, even one made while the service was out of reach. Signed out with changes waiting, the Account says how many aren't synced to the account that made them, and that signing in to another account removes them. Another account's sign-in replaces the copy with that account's, whether it signs in here or from the website. Deleting the account keeps the copy's words, lists and notes in this browser, and drops only that account's waiting changes and where its sync had got to. | `copy-owner.test.ts`; `copy-channel.test.ts`, "hands the copy to the account the website signs in…"; `src/account/unsynced-warning.interaction.test.tsx`; `e2e/account-sync.spec.ts`, another account, and a change queued while the service is out of reach |
| When the service can't be reached, or answers with something that isn't JSON, the changes wait and it tries again after 2 seconds, twice as long each time after, at most 5 minutes. Too many requests waits as long as the service says. Without cloud access nothing is sent and the changes wait; a sync refused for it reads the subscription again and waits for Sync Now. A refused access token is asked for once more; a session the service has ended signs out, keeping the copy. A change the service refuses stays here, unsynced, and goes again on Sync Now or when it's changed again; the other changes still go. | `sync-failures.test.ts`; `e2e/account-sync.spec.ts`, a change queued while the service is out of reach, and no cloud access |

## Kept from the page

Every call to the account service goes through the extension's service worker, and the tokens
stay there: a page or a content script reads none of them
(`src/service-worker/account/channel.test.ts`; `e2e/account.spec.ts`, a content script finds no
token). A content script can read only whether the learner is signed in and the subscription's
cloud access, never the email or the rest of the subscription, and can't sign in or out, or
delete the account (`channel.test.ts`, "answers a content script only a read…" and "answers a
content script's read of a signed-in account…"). It can ask whether words or kanji are known,
and hears when that changes, and can read and change one word's part of the copy, its state, the
lists that hold it, and its notes, but never opens the copy, and the page it runs on holds none
(`src/service-worker/copy/copy-channel.test.ts`; `copy-words.test.ts`, "one word's part of the
copy"; `e2e/account-sync.spec.ts`, a content script). The service worker refuses a change
signed out, or while the account needs the subscription, and keeps nothing; when a sync is
refused for the subscription later, it tells the page that made the change once
(`copy-words.test.ts`, "saving refused by the service worker"). The word popup shows each as a
toast ([`word-popup.md`](word-popup.md), Its actions).
How the extension signs in is in
[`account-extension.md`](../../../../docs/agents/account-extension.md).

## Not built yet

The Account tab's view of the copy and Sync Now are #1188, pages that follow Known words #1187,
saving kanji #1189, and the saving's browser tests and screenshots #1190. Watched videos
sync with #965. Google and Apple are checked against stand-ins: a real sign-in with each is #987.
The website's handover is checked locally, with the website and the account service from the
checkout; on staging it waits on #960.
