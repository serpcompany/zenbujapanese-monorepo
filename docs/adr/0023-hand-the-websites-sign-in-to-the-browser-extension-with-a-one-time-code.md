---
status: accepted
---

# Hand the website's sign-in to the browser extension with a one-time code

The browser extension signs in as its own app, `zenbu-extension`, with a bearer session of its own
and never the website's cookie
([ADR 0022](0022-save-in-the-browser-extension-only-with-the-subscription.md),
[#961](https://github.com/serpcompany/zenbujapanese-monorepo/issues/961)): with an emailed code,
Google, or Apple. A learner signed in on zenbujapanese.com had to sign in once more in the
extension. The owner decided in
[#1130](https://github.com/serpcompany/zenbujapanese-monorepo/issues/1130) (D5) that the website's
sign-in carries over in one click, as one more way in, kept beside the others.

## What happens

- **The website's `/account/extension/` page asks the account service for a code,** with its
  session cookie: `POST /v1/auth/extension-code`. Only a website session, from one of the
  website's origins, gets one. The code is random, works once, only for `zenbu-extension`, and for
  5 minutes, and the service keeps only its SHA-256, in `verifications`.
- **The page hands the code to the extension by message,** through `externally_connectable`, which
  names only the build's own website (staging's in a staging build). The extension takes the
  message only from that origin, by the sender Chrome reports, never by anything in the message.
- **The extension redeems it** at `POST /v1/auth/sign-in/extension-code` for a session of its own,
  kept as every other way in keeps one. The session counts as signed in when the website's session
  did, so a delete still asks for a fresh sign-in. The code keeps the website session's ID, and is
  refused once that session has signed out or run out.
- **The two sessions stay apart:** signing out of either leaves the other signed in.

## Not taken

- **Sharing the website's cookie,** or reading it with the `cookies` permission: the extension
  would hold the website's session, and its sign-out would end the website's (#944).
- **Better Auth's one-time-token plugin:** it hands over the same website session, not one for
  `zenbu-extension`, and can't tell a code that ran out from one that was used.
- **Sending the code in a URL,** such as a `chrome.identity` window that ends at the extension's
  `chromiumapp.org` address: the code would sit in the browser's history.

## Costs

- A route makes a session from another session, so a stolen website cookie also signs an extension
  in. It gives little more than the cookie does, which already holds the account, and the code
  can't be had without it.
- The page reaches the extension only in Chrome, with the extension installed; elsewhere it says
  so, and the other ways in still work.
- The check of the sender is Chrome's: a page that Chrome reports as the website is taken as it.
