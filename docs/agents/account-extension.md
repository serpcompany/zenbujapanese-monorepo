# Signing in from the browser extension

The Chrome extension ([`extension.md`](extension.md)) signs in to the Zenbu account as an app,
`zenbu-extension`, with its own bearer session, never the website's cookie
([ADR 0022](../adr/0022-save-in-the-browser-extension-only-with-the-subscription.md), #960). The
[client guide](account-clients.md) holds for it; this is what a browser changes. How the
extension does it, #961's, is in In the extension, below, and how it keeps the account's words in
step, #979's, in The copy.

## What the service lists

- **The client,** in `apps/account-api/src/domain/clients.ts`, with the scopes in the client
  guide's table. The extension doesn't show or edit the profile, so it has no `account` or
  `profile` (#941, Open question 27): it keeps the `user` its sign-in answered, as Tomodachi does.
  `extensionIds` holds the Chrome Web Store item's ID, `kaalpflpefadijdemimciikalgpgjmok`, which
  every unpacked build has too ([`extension.md`](extension.md), The ID), so staging and tests need
  no second ID.
- **Its origin,** `chrome-extension://<id>` for each listed ID, is one Better Auth trusts
  (`src/auth/auth.ts`), so sending a code and signing out pass its origin check. An extension the
  service doesn't list is refused there, `403 invalid_origin`, as any origin it doesn't trust.
  Better Auth checks the origin of sending a code and of any request with a cookie; a sign-in or
  sign-out without a cookie passes from any origin, as an app's does, on the code, ID token, or
  session token it carries.
- **Never in `ACCOUNT_API_TRUSTED_ORIGINS`.** That setting makes an origin the website's: its
  answers would leave out `set-auth-token`, and a sign-in naming no app would be the website's. So
  the extension names itself in `X-Zenbu-Client` on every sign-in, and one without it is refused
  `400 unknown_client`.
- **No CORS.** The extension's service worker makes every call, and its pages and content scripts
  ask it by message: a content script's `fetch` to the service fails (#944). Its host permission
  exempts the service worker from CORS, so the service sends no `Access-Control-Allow-Origin` to
  an extension.
- **No cookie.** An answer to any `chrome-extension://` origin sets none (`src/http/app.ts`): the
  browser's cookies for the API host are the website's too, so an extension's session cookie would
  replace the website's session, and its sign-out would end it. Call with `credentials: 'omit'`
  all the same, so the website's cookie never goes with the extension's calls, and the browser
  keeps no cookie from an answer, even one without an `Origin`.

## Keeping the tokens

- The **session token** from `set-auth-token` goes in `chrome.storage.local`, which the service
  worker closes to content scripts with
  `chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })` at install and at
  each start. The 15-minute **access token** goes in `chrome.storage.session`, refreshed as the
  client guide's Access tokens says.
- **Each answer is kept for the session that asked.** A token, a subscription, or a refused
  session is kept, or forgets the account, only while the session token it was asked with is
  still the one kept; one that comes back after a sign-out, or a sign-in to another account, is
  dropped (`tokens.test.ts`, "an access token that comes back after the session it was asked
  with ended"). A sign-in writes the session before it clears the access token, and a sign-out
  removes the session before the access token, so a late answer finds the new one.
- **The store writes one at a time.** Every write to the account's keys goes through the one
  `accountStore` the service worker makes (`channel.ts`), which runs them in turn, so no write
  reads the account and writes it back over another's (a sign-in, a subscription, Subscribe…, a
  token, or a sign-out); each checks the session token that asked when its turn comes. The
  access token is kept with its session token's SHA-256, never the session token, and is
  answered only for that session (`store.test.ts`, a sign-in to another account landing in the
  middle of a write).
- Never send `Authorization` on a sign-in: a sign-in with a session adds a way in to that account,
  which needs `account`.
- No token, code, or email goes in an error report.

## The ways in

Each runs in the service worker, and Google's and Apple's in `chrome.identity.launchWebAuthFlow`
with `interactive: true`. Each sends `X-Zenbu-Client: zenbu-extension`.

- **From the website,** first in the list: below, From the website.
- **An emailed code,** as the client guide says.
- **Google:** a nonce from `POST /v1/auth/sign-in/nonce`, then Google's authorize URL with the
  extension's Google client ID (a Web application client), `response_type=id_token`,
  `scope=openid email profile`, the nonce itself as `nonce`, and
  `chrome.identity.getRedirectURL('google')`, `https://<id>.chromiumapp.org/google`, as
  `redirect_uri`. Google answers the ID token in the fragment, and the extension signs in with it
  and the nonce on `POST /v1/auth/sign-in/social`. Not `chrome.identity.getAuthToken`, which
  answers an access token for the browser's own Google account.
- **Apple:** a nonce, then Apple's authorize URL with the website's Services ID as `client_id`,
  `response_type=code id_token`, `response_mode=form_post`, `scope=name email`, the nonce's
  SHA-256 in lowercase hex as `nonce`, a `state` naming the extension (below), and the return
  route, `<API host>/v1/auth/apple/extension`, as `redirect_uri`. Apple posts its answer there, and
  the route answers `303` to `https://<id>.chromiumapp.org/apple#<the fields>`, which ends the
  flow. The extension checks that `state` is the one it sent, then signs in with `id_token` and
  the nonce, as an app does, passing the name from `user` as `idToken.user.name` on a first
  sign-in. The Services ID is an audience the service takes, and no app lists it, so there is no
  `client_mismatch`.

## From the website

A learner signed in on zenbujapanese.com signs the extension in with one click, on the website's
`/account/extension/` page, which Continue with zenbujapanese.com opens (#1130). The extension
gets a session of its own, `zenbu-extension`'s, never the website's cookie. The service's side is
a Better Auth plugin, `apps/account-api/src/auth/extension-code.ts`, declared for the contract in
`src/http/extension-code-contract.ts`; each route takes twenty requests a minute. Why it is a code
handed by message is [ADR 0023](../adr/0023-hand-the-websites-sign-in-to-the-browser-extension-with-a-one-time-code.md).

- **The website asks for a code,** `POST /v1/auth/extension-code`, with its session cookie and
  `credentials: 'include'`, as its other account pages call. Only a website session gets one: an
  app's bearer session is refused `403 website_only`, no session `401 unauthorized`, and a cookie
  from an origin the service doesn't trust `403 invalid_origin`. The code is 32 random bytes,
  kept only as its SHA-256 in `verifications`, for 5 minutes, naming `zenbu-extension`.
- **It hands the code over by message,** `chrome.runtime.sendMessage('<id>', { type: 'sign-in',
  code })`, which `externally_connectable` lets only the build's website send:
  `https://zenbujapanese.com/*`, staging's alone in a staging build, and the test build adds
  `http://localhost/*` and `http://127.0.0.1/*` on any port (`build/hosts.ts`, `websitesOf`).
  The service worker's `onMessageExternal` listener (`website-sign-in.ts`) checks the sender's
  origin against that list again, never anything in the message, and leaves every other message
  unanswered. A page without the extension finds no `chrome.runtime`, or no receiving end.
- **The extension redeems it,** `POST /v1/auth/sign-in/extension-code` with `{ code }` and
  `X-Zenbu-Client: zenbu-extension`, and keeps the session as every other way in does
  (`keepSignIn`), handing the copy to its account and syncing it as they do (`keep` in
  `account-service.ts`). A code works once: a second use, one the service never made, or one whose
  website session has since signed out or run out, is `401 invalid_code`, one over 5 minutes
  old `401 code_expired`, and another app's `403 client_mismatch`; each of these spends it. No
  client header is `400 unknown_client`, which doesn't. The session counts as signed in when the
  website's did, so it is no fresher.
- **The website hears only whether it worked:** `{ signedIn: true }` once the session is kept,
  even when the subscription read after it fails (reported as `account-answer`), or
  `{ signedIn: false, refusal }`, `signed-in-already` (a browser signed in already keeps its
  account and redeems nothing), `wait`, or `try-again`. Never the email or a token.
- **The code goes nowhere else:** it isn't logged, reported, put in a URL, or kept by the
  website, and the extension's error reports carry only `account-answer`.
- **Signing out of either leaves the other signed in:** they are two sessions.

## Apple's return route

`POST /v1/auth/apple/extension` (`src/http/apple-extension.ts`) takes Apple's form, at most 64 KB:
`id_token`, `code`, `user` (the name and email as JSON, on a first sign-in only), and `state`, or
`error`, such as `user_cancelled_authorize`, in place of the tokens.

- **`state`** is the extension's ID, alone or followed by `.` and a random value of the extension's
  own, which it checks on the way back. An ID the service doesn't list answers
  `400 unknown_extension`, and a form without `state` `400 bad_request`: nothing is sent on.
- **The `303`** goes to that ID's `chromiumapp.org` URL only, with those five fields, as Apple sent
  them, form-encoded in the fragment, which no server receives, with `Cache-Control: no-store` and
  `Referrer-Policy: no-referrer`.
- It is mounted before Better Auth's handler, so it runs no origin check, since Apple posts from
  its own; it checks no token, sets no cookie, and stores nothing. What it sends on is what was
  posted, and only to a listed extension, so it gives no one a token they didn't post. A page that
  posts a form of its own sends its own tokens on, which the extension refuses: their `state` isn't
  one it sent, and their nonce isn't the extension's.
- It isn't one of Better Auth's routes (`src/auth/routes.ts`), and the cloud gate leaves it free
  as a sign-in route ([`account-billing.md`](account-billing.md), The gate).

## Deleting an Apple account

As the client guide's Deleting the account says. The extension has no `account`, so it sends
`DELETE /v1/me` without a code first; on `400 apple_authorization_needed` it signs in with Apple
through the return route, and sends that sign-in's `code` as `appleAuthorizationCode`, never
`appleRedirectUri`. The service exchanges the code as the website's Services ID, with the return
route's URL as `redirect_uri`, since that's where Apple sent it (`src/auth/apple-revoke.ts`).
An Apple sign-in that answers no `code` sends no delete: the extension ends that session and
answers `apple-again`, Continue with Apple again.

## In the extension

- **The service worker makes every call** (`src/service-worker/account/`): `api.ts` sends each
  with `credentials: 'omit'`, the client header on a sign-in, and a bearer token on the others;
  `sign-in.ts` holds the ways in and turns the service's refusals into the learner's
  (`Refusal` in `src/shared/account.ts`); `identity.ts` opens Google's and Apple's windows;
  `tokens.ts` keeps the access token and asks again once after a `401`; `store.ts` keeps them;
  `account-service.ts` signs in, reads the subscription, signs out, and deletes; and `channel.ts`
  closes `chrome.storage.local` to content scripts at each start, answers a page's ask, and reads
  the subscription when the browser starts. Only the extension's own pages, by the sender's
  origin, may sign in or out, delete, or send a code: a content script's ask is answered only
  when it reads the account, so a page that took over its renderer can't sign the learner out,
  and its read answers only `{ type: 'access', signedIn, cloudAccess }`, never the email or the
  rest of the subscription.
- **A page asks by message,** `askAccount()` in `src/shared/account.ts` (`{ target:
  'service-worker', account }`), and reads the account the service worker keeps under `account` in
  `chrome.storage.local`: the email and the subscription, never a token. `onAccountChanged` tells
  it of a change, so the side panel and Settings show the same account. Each time a page opens
  the account or comes back into view (`opened`), the service worker asks `GET /v1/auth/token`
  once if no access token is kept that has more than a minute left, so a session ended
  elsewhere shows signed out then. The subscription is read again when a page comes back into
  view after Subscribe… or Manage Subscription, and again each time until a read is kept;
  `cloudAccess` is kept with it, for saving (#962).
- **Deleting** asks for a fresh sign-in to the same account, which keeps the subscription it
  had. When the service needs Apple, Continue with Apple signs in with Apple again, so the delete
  goes with that fresh session and its `code`, never an earlier session over 10 minutes old.
  A delete whose answer is lost is never taken for done: the service names no code for an
  account that no longer exists, and `401 unauthorized` from `GET /v1/auth/token` also means a
  session that ended. It asks the learner to try again, forgets nothing, and asks nothing more.
  A try again, the delete or its Send Code (`send-code` with `deleting`), first asks
  `GET /v1/auth/token` for the kept session, whatever access token is kept: a `401` forgets it
  and answers signed out, with no code emailed and no sign-in, since an emailed-code sign-in to
  a deleted account would make a new one. A good session goes on to the fresh sign-in.
- **The account component,** `src/account/`, is the one the side panel's Account tab and
  Settings' Account page both draw ([product docs](../../apps/extension/docs/product/account.md)).
  It shows each answer's problem inline, by the field or the button it belongs to, with no toast.
- **The hosts and IDs** follow `ZENBU_ENVIRONMENT` (`build/hosts.ts`): the API host is
  `https://api.zenbujapanese.com`, `https://api-staging.zenbujapanese.com` in staging, and
  `http://account-api.localhost` in the test build, and is in `host_permissions`. Apple's ID is
  the website's Services ID. The Google client ID is `null` until #987 makes the client, so a
  release build draws no Continue with Google and asks Google nothing; the test build's is a
  stand-in the browser tests' service takes.
- **Its tests:** the modules' own, on a stand-in service and stand-in windows
  (`src/test/account-stand-in.ts`); the component's, in happy-dom; and `e2e/account.spec.ts` and
  `e2e/website-sign-in.spec.ts`, against the account service from the checkout
  ([`extension-browser-tests.md`](extension-browser-tests.md), The account service).

## The copy

- **One copy, in the service worker** (`src/service-worker/copy/`): `kept.ts` holds it in memory
  and saves each edit to IndexedDB, `zenbu-account-copy` on the extension's origin
  (`indexed-storage.ts`), with its items, the changes not yet synced, the cursor, and the user it
  belongs to. Each edit runs in `accountStore.inTurn`, after the account's own writes, so a
  sign-in or sign-out and an edit never cross; nothing calls the network inside a turn.
  `copy-changes.ts` makes each change one queued mutation per entity, folding a second change to
  the same one into it while it waits. The format can change freely: no learner has one yet.
- **Sync** (`sync.ts`, `answer.ts`) follows the client guide: up to 50 mutations a request, a sent
  one sent again unchanged until answered, the account winning a conflict, a note changed in both
  places kept twice, a later change to the same one re-based on the version a conflict or an
  applied answer gave, a list word held until its list arrives, and a `410` read again from the
  start once: a `410` while reading from the start reports `account-sync-reread` and waits. A
  `400` or `413` clears the batch's sent marks and sends half as many until the refused change
  goes alone; that one is reported, stays queued and unsynced, and stays out of later requests
  until it is changed again. It takes the access token through #961's `tokens.withAccess`, so a `401` asks for a new
  token once; a `401` for the session signs out. A network failure or an answer that isn't JSON
  waits 2 seconds, then twice as long each time, at most 5 minutes; a `429` waits its
  `Retry-After`; one timer waits for the later of two waits. A `402` keeps the queue, reads the
  subscription again, and stops until Sync Now or access comes back. While `cloudAccess` is
  `subscription_required`, nothing is sent; Sync Now and a page's `opened` read the subscription
  again first. It runs
  after a change, on `runtime.onStartup`, on a page's `opened` with changes waiting or no sync for
  15 minutes, and on Sync Now, never on `chrome.alarms`: a wait lost when Chrome stops the service
  worker is made up by the next of those.
- **Settings** (`synced-settings.ts`): the five reading aids and `frequencyDictionaries.chosen`
  go up, the chosen packs joined by commas; `readingAids.translationLanguage` and
  `translationSource` only come down. A first sign-in sends those changed from their defaults at
  version 0. The account's values are written to `chrome.storage.local` before the copy records
  them, so a failed write sends nothing stale. `frequency-order.ts` keeps in their places the pack
  IDs the extension doesn't have, such as the app's Jiten and Wikipedia, when the learner ticks or
  moves a pack.
- **Whose copy:** a sign-in to the same user resumes it; another user's drops it, tells pages and
  tabs `{ target: 'known', known: null }`, and reads that account from the start. A change or a
  sync that finds the copy still another user's, after a stop between the sign-in's two writes,
  takes it over the same way. Sign-out keeps
  it; deleting the account keeps it too, and forgets that account's queue and cursor.
- **Asking it** (`copy-channel.ts`, `src/shared/account-copy.ts`): a page sends `askCopy()`
  (`{ target: 'service-worker', copy }`) to read it, change it, sync now, or say it opened. A
  content script may only ask `known` for at most 1,000 items, and hears `{ target: 'known' }`
  when that changes; it never opens IndexedDB, which is the page's own in a content script.
- **Errors** report only `account-copy`, `account-sync`, and `account-sync-reread`
  ([`extension-error-reports.md`](extension-error-reports.md)).
- **Its tests** run the real copy on in-memory storage and a stand-in service
  (`src/test/copy-world.ts`, `src/test/copy-stand-in.ts`), and `e2e/account-sync.spec.ts` syncs
  two browser profiles with the account service from the checkout, signing in with the Google
  stand-in, since that service emails at most 5 codes in 10 minutes.

## Setting it up

The extension's Google client, its ID on `GOOGLE_CLIENT_IDS`, and the return route's URLs on the
website's Services ID are the owner's, in the consoles ([`account-api.md`](account-api.md), Set up
the server; #987). A second listed extension adds its ID to `extensionIds` and its redirect URI to
the extension's Google client.

The tests are `src/http/extension-client.test.ts`, which sends each request as
`Origin: chrome-extension://kaalpflpefadijdemimciikalgpgjmok` with `Sec-Fetch-Site: none`, as
Chrome does.
