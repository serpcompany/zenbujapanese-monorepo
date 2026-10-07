# Privacy Policy

`/legal/privacy/` is the privacy policy for the Zenbu Japanese iPhone app, the website, and the
Zenbu account, including Tomodachi's use of it. The shipped app and its App Store listing reach it
through `/privacy` ([App links](dictionary.md#header-footer-and-site-wide)). Its text is
`apps/web/src/app/legal/privacy/page.tsx`. Each behavior below says what the page says, where it
comes from, and the automated check that enforces it (see
[How behavior is verified](index.md#how-behavior-is-verified)).

What the page says about the account follows the account service as the owners designed it on
#563 (decisions 1, 2, 4, 5, and 6) and as #565, #566, #567, #570, #572, and #574 build it. No app
signs in yet, so the page says what happens "if you create or link a Zenbu account", never that
one exists today. When the service keeps something new, keeps it longer, or an app gets a new
scope, change the page, its Effective date, this doc, and the
[App Store privacy labels](../app-store-privacy-labels.md) in the same pull request.

## Behaviors

**The account's data.** The page lists what a Zenbu account keeps:

- the account: a Zenbu user ID, the email and whether it's verified, an optional name and
  username, a profile picture's address only if Apple or Google sends one at sign-up, and when it
  was created and last changed, with the profile's version;
- each way the learner signs in (Apple, Google, or an emailed code): the provider and the
  learner's account ID with it, and never Apple's or Google's own tokens;
- a session for each signed-in device or browser, with its IP address and user agent;
- the codes, stored encrypted, and the sign-in nonces, for 10 minutes, and request counts by IP
  address for a few minutes;
- the synced study data: known words by the dictionary's ID with their status, lists (names,
  order, and words), a record of each item's latest change, and each sync request's result.

It says the apps work fully signed out and send the account service nothing then, that notes,
photos, recent searches, and settings stay on the device, what the account's email is used for
(codes, and a notice when a way to sign in is added or removed), and that the logs hold each
request's method, route, status, and timing, never an email, a profile, a code or link, or a token.

- Source: #563 decisions 1 and 2; #566 (sign-in), #567 (the profile and sync), #572 (known words
  and lists).
- Check: `apps/web/e2e/privacy.spec.ts`, "names what a Zenbu account keeps, and that signed out the
  apps send it nothing".

**Tomodachi.** The page names Tomodachi, the companion app for Mac and iPhone, and says it works
without an account and keeps its own progress in the learner's iCloud. Linked to a Zenbu account, it
can only read the learner's lists and known words, mark words Known without ever clearing a mark,
and fetch word cards and the segmentation of typed answers from the dictionary service, which
keeps neither in the account or its logs. The page says it will name what another app, such as
the browser extensions, can do before that app uses the account.

- Source: #563 decisions 4, 5, and 6; #570 (Tomodachi's scopes); #571.
- Check: `apps/web/e2e/privacy.spec.ts`, "names Tomodachi and the only things it can do with the
  account".

**Where it's kept, and who processes it.** The account's database is on the API servers, behind
Cloudflare, and is backed up each night to a private Cloudflare R2 bucket. The processors are
Apple (Sign in with Apple), Google (Google sign-in), Cloudflare (traffic, email, and backups), and
the company that hosts the API servers, which the page doesn't name.

- Source: #563 decisions 1 to 3; #565 (the service and its backups).
- Check: `apps/web/e2e/privacy.spec.ts`, "names where account data is kept and who processes it".

**Retention, a copy, and deletion.** The page says how long each kind of account data is kept: the
account and its synced data until it's deleted; a session until sign-out or 60 days after its last
use; codes and nonces for 10 minutes; each sync request's result for 30 days; each backup for 30
days. A learner deletes the account from any app that can make one, which removes the account, its
ways to sign in, and its synced data at once; backups age out within 30 days, and each device keeps
its own data and works signed out. There's no export feature: a learner asks
`support@zenbujapanese.com` for a copy.

- Source: #574 (deletion); #565 (the backups' 30 days); the export by email is the owners' to
  confirm.
- Check: `apps/web/e2e/privacy.spec.ts`, "says how long account data is kept, how to get a copy, and
  how to delete it".

**The rest of the policy.** The short version sums up all of the above. The app's on-device data
names the profile and the Media Library's photos, and says an Image Search image is kept in the
Media Library once a word is opened from it, as the app's
[Image Search](../../../ios/docs/product/dictionary.md#image-search) docs say. The app's network
features add sign-in and sync, only with an account. Its permissions, the website's hosting and
analytics, support email, children, and changes and contact are as they were.

- Source: the policy of September 28, 2026; the app's [Account](../../../ios/docs/product/index.md#account)
  docs (the profile and the Media Library).
- Check: `apps/web/e2e/layout.spec.ts`, "/legal/privacy/ fits the window, with the site's header and
  footer". The text: No automated check yet.
