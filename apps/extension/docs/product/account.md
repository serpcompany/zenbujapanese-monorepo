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
| "Not signed in", that a Zenbu account keeps known words, lists and notes on all devices, then Email and Send Code, "or", Continue with Google, and Continue with Apple. | `says Not signed in and offers an emailed code, Google, and Apple` |
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
| Delete Account asks first, in a dialog that says what deleting removes and that an App Store subscription goes on billing, or that a website one ends. Keep My Account keeps it. Delete My Account asks for a fresh sign-in to the same account, then deletes it, says so, and shows "Not signed in". For an account that signs in with Apple, Continue with Apple signs in with Apple once more, so the delete goes with a fresh session and Apple's code; when Apple gives no code, it deletes nothing and says to continue with Apple again. A sign-in to another account deletes nothing, and a delete that doesn't finish keeps the subscription shown. A delete whose answer is lost says to try again and keeps the account shown. | `warns that an App Store subscription goes on…`; `asks for Apple when the service needs Apple…`; `deletes nothing when the fresh sign-in is to another account`; `account-service.test.ts`, "signs in with Apple again…", "asks to continue with Apple again…", "keeps the account's subscription through the fresh sign-in…", and "never takes a lost answer to a delete for done…"; `e2e/account.spec.ts`, deleting an email account |

## Kept from the page

Every call to the account service goes through the extension's service worker, and the tokens
stay there: a page or a content script reads none of them
(`src/service-worker/account/channel.test.ts`; `e2e/account.spec.ts`, a content script finds no
token). A content script can read only whether the learner is signed in and the subscription's
cloud access, never the email or the rest of the subscription, and can't sign in or out, or
delete the account (`channel.test.ts`, "answers a content script only a read…" and "answers a
content script's read of a signed-in account…"). How the extension signs in is in
[`account-extension.md`](../../../../docs/agents/account-extension.md).

## Not built yet

Saving words is #962, and syncing them #979. Signing in once on zenbujapanese.com and carrying it
to the extension is #1130. Google and Apple are checked against stand-ins: a real sign-in with
each is #987.
