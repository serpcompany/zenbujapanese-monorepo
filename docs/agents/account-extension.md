# Signing in from the browser extension

The Chrome extension ([`extension.md`](extension.md)) signs in to the Zenbu account as an app,
`zenbu-extension`, with its own bearer session, never the website's cookie
([ADR 0022](../adr/0022-save-in-the-browser-extension-only-with-the-subscription.md), #960). The
[client guide](account-clients.md) holds for it; this is what a browser changes: what the service
and the website do for the extension, and what the extension must do to use them. The extension's
own sign-in, which follows this, reaches `main` with the extension itself (#1070).

## What the service lists

- **The client,** in `apps/account-api/src/domain/clients.ts`, with the scopes in the client
  guide's table. The extension doesn't show or edit the profile, so it has no `account` or
  `profile` (#941, Open question 27): it keeps the `user` its sign-in answered, as Tomodachi does.
  `extensionIds` holds the Chrome Web Store item's ID, `kaalpflpefadijdemimciikalgpgjmok`. The
  extension's builds share that ID through the store item's public key (#986, with #1070), so
  staging and tests need no second ID.
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
- Never send `Authorization` on a sign-in: a sign-in with a session adds a way in to that account,
  which needs `account`.
- No token, code, or email goes in an error report.

## The ways in

Each runs in the service worker, and Google's and Apple's in `chrome.identity.launchWebAuthFlow`
with `interactive: true`. Each sends `X-Zenbu-Client: zenbu-extension`.

- **From the website:** below, From the website.
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
`/account/extension/` page (#1130), which the extension's Continue with zenbujapanese.com opens
once the extension reaches `main` (#1070). The extension gets a session of its own,
`zenbu-extension`'s, never the website's cookie. The
service's side is a Better Auth plugin, `apps/account-api/src/auth/extension-code.ts`, declared for
the contract in `src/http/extension-code-contract.ts`; each route takes twenty requests a minute.
The website's is `apps/web/src/lib/account/extension.ts`
([product docs](../../apps/web/docs/product/extension-sign-in.md)). Why it is a code handed by
message is [ADR 0023](../adr/0023-hand-the-websites-sign-in-to-the-browser-extension-with-a-one-time-code.md).

- **The website asks for a code,** `POST /v1/auth/extension-code`, with its session cookie and
  `credentials: 'include'`, as its other account pages call. Only a website session gets one: an
  app's bearer session is refused `403 website_only`, no session `401 unauthorized`, and a cookie
  from any origin but the website's, the extension's included, `403 invalid_origin`. The code is
  32 random bytes, kept only as its SHA-256 in `verifications`, for 5 minutes, naming
  `zenbu-extension`.
- **It hands the code over by message,** `chrome.runtime.sendMessage('<id>', { type: 'sign-in',
  code })`, to the store item's ID alone. The extension must take it from its build's website
  alone: its `externally_connectable` lists only `https://zenbujapanese.com/*`, or staging's
  alone in a staging build, and its service worker checks the sender's origin against that list
  again, never anything in the message, and leaves every other message unanswered. The website
  checks for `chrome.runtime` first, so a browser without the extension asks for no code.
- **The extension redeems it,** `POST /v1/auth/sign-in/extension-code` with `{ code }` and
  `X-Zenbu-Client: zenbu-extension`, and keeps the session as its other ways in do. A code works
  once: a second use, one the service never made, or one whose website session has since signed
  out or run out, is `401 invalid_code`, one over 5 minutes old `401 code_expired`, and another
  app's `403 client_mismatch`; each of these spends it. No client header is
  `400 unknown_client`, which doesn't. The session counts as signed in when the website's did, so
  it is no fresher.
- **The website hears only whether it worked:** `{ signedIn: true }` once the extension has kept
  the session, or `{ signedIn: false, refusal }`, `signed-in-already` (an extension signed in
  already keeps its account and redeems nothing), `wait`, or `try-again`; it takes any other
  answer as `try-again`. Never the email or a token.
- **The code goes nowhere else:** the website doesn't show, log, report, put in a URL, or keep it.
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

## Setting it up

The extension's Google client, its ID on `GOOGLE_CLIENT_IDS`, and the return route's URLs on the
website's Services ID are the owner's, in the consoles ([`account-api.md`](account-api.md), Set up
the server; #987). A second listed extension adds its ID to `extensionIds` and its redirect URI to
the extension's Google client.

The tests are `src/http/extension-client.test.ts`, which sends each request as
`Origin: chrome-extension://kaalpflpefadijdemimciikalgpgjmok` with `Sec-Fetch-Site: none`, as
Chrome does, and `src/auth/extension-code.test.ts`, the website's code for the extension. The
website's are in its [product docs](../../apps/web/docs/product/extension-sign-in.md).
