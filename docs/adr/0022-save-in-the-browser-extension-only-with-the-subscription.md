---
status: accepted
---

# Save in the browser extension only with the subscription

[ADR 0013](0013-run-accounts-and-sync-in-their-own-service-on-the-api-servers.md) keeps every Zenbu
app local-first: without an account an app loses sign-in and sync, never a local feature, and the
iPhone app saves known words, lists and notes signed out. The browser extension is the exception.
It saves known words, lists and notes only signed in and with the subscription. The owner decided
this on 2026-10-22 ([#941](https://github.com/serpcompany/zenbujapanese-monorepo/issues/941), Free
and paid and Open question 16), and settled what another account's sign-in does on 2026-10-24
(Open question 19).
[#944](https://github.com/serpcompany/zenbujapanese-monorepo/issues/944) found how the extension
signs in and keeps its copy.

## What the extension does

- **The account service decides who may save.** The extension reads `cloudAccess` from
  `GET /v1/me/subscription` and acts on it. `subscription_required`, or a
  `402 subscription_required` from `POST /v1/sync`, means saving doesn't work, and the extension
  offers the subscription on zenbujapanese.com. The extension has no rule of its own.
  [ADR 0019](0019-sell-one-subscription-through-the-app-store-and-stripe.md) sells the
  subscription.
- **`ACCOUNT_API_CLOUD_FREE_APPS` never lists `zenbu-extension`.** Listing it would make saving
  free.
- **Everything else stays free and local:** lookups, reading aids, video study and every other
  feature. So do the browser's Recent and settings, which sync only with the subscription.
- **The browser keeps a copy of the account's saved words, and shows it signed out.** Signing out
  doesn't empty it. Saving more asks to sign in again.
- **When another account signs in, its copy replaces the browser's.** Changes not yet synced are
  lost.
- **It signs in as an app, not as the website,** with a bearer session, as `zenbu-extension`: the
  client the account service is to add, with its scopes
  ([#960](https://github.com/serpcompany/zenbujapanese-monorepo/issues/960)). The service has no
  such client yet, and refuses it as `unknown_client`. Better Auth trusts its `chrome-extension://`
  origin, which is never one of the website's (`ACCOUNT_API_TRUSTED_ORIGINS`): that setting makes
  the service strip the session token from every answer to the origin (#944, run B).
- **On iPhone, the Safari extension's saving is the app's, and free.**

## Why the app differs

The app saves signed out and uploads its copy to the account that signs in. In the extension,
everything saved came from an account, since saving needs one. Uploading the browser's copy to
whichever account signs in next would copy one person's words into another's on a shared computer.
So the new account's copy replaces the browser's.

## Costs

- A free learner on a computer can't save a word, and sees an offer of the subscription where the
  app would have saved it.
- Changes queued but not yet synced are lost when another account signs in. Not taken: keeping
  each account's copy apart by user ID, which loses nothing, and uploading the copy into the new
  account, as the app does, which merges two people's words.
