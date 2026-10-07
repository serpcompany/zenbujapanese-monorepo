# Privacy Policy

`/legal/privacy/` is the privacy policy for the Zenbu Japanese iPhone app, the website, and the
Zenbu account, including Tomodachi's use of it. The shipped app and its App Store listing reach it
through `/privacy` ([App links](dictionary.md#header-footer-and-site-wide)). Its text is
`apps/web/src/app/legal/privacy/page.tsx`. Each behavior below says what the page says, where it
comes from, and the automated check that enforces it (see
[How behavior is verified](index.md#how-behavior-is-verified)).

What the page says about the account follows the account service as the owners designed it on
#563 (decisions 1 to 6) and as #565, #566, #567, #570, #572, and #574 build it, and the website's
account pages (#468). The website signs in; the app doesn't yet, so the page says the app has "no
account or cloud sync yet", and that a learner can create or sign in to an account on this
website. The pull request that lets the app sign in (#573) changes the short version and the
account section's "yet". When the service keeps something new, keeps it longer, sends email through another provider,
or an app gets a new scope, change the page, its Effective date, this doc, and the
[App Store privacy labels](../app-store-privacy-labels.md) in the same pull request.

## Behaviors

**The account's data.** The short version says the app collects nothing and has no account or
cloud sync yet, that a learner can make an account on this website, and that the website uses a
cookie only to keep them signed in. The account section says the website offers accounts and the
app doesn't yet, that the apps send the account service nothing while signed out, and lists what a
Zenbu account keeps:

- the account: a Zenbu user ID, the email and whether it's verified, an optional name and
  username, a profile picture's address only if the provider sends one at sign-up, and when it
  was created and last changed, with the profile's version;
- each way the learner signs in (Apple, Google, or an emailed code): the provider and the
  learner's account ID with it, and never Apple's or Google's own tokens;
- a session for each signed-in device or browser, with its IP address and user agent;
- the synced study data: known words (by Language Reference ID, with their status), lists (names,
  order, and words), a record of each item's latest change, deletions included, and each sync
  request's result.

It also says the codes are kept encrypted, and nonces too, for 10 minutes, with request counts by
IP address for a few minutes; that notes, photos, recent searches, and settings stay on the device;
what the account's email is used for (codes, and a notice when a way to sign in is added or
removed); and that the account service's logs hold each request's method, route, status, and
timing, never an email, a profile, a code or link, or a token.

- Source: #563 decisions 1 and 2; #566 (sign-in), #567 (the profile and sync), #572 (known words
  and lists).
- Check: `apps/web/e2e/privacy.spec.ts`, "names what a Zenbu account keeps, and that signed out the
  apps send it nothing": the short version's "not yet", the four kinds of data, nothing sent signed
  out, the encrypted codes, and what stays on the device. The email's uses and the logs: No
  automated check yet.

**The website's account pages.** A section, "Your account on this website", lists what the
website can do signed in, and only that: show the email and show and change the name and username;
show how the learner signs in, and add or remove a way; sign out of this browser; delete the
account. It says the website doesn't read or change known words or lists yet, that its pages
connect from the browser to the account service only when the learner opens the account page or
starts signing in, and that Apple's script and window, and Google's page, come from those
companies. The website section names each thing signing in keeps in the browser: the
`__Secure-zenbu.session_token` cookie, which keeps the learner signed in for 60 days from its last
use or until they sign out or delete the account; the `__Secure-zenbu.state` cookie, for 5 minutes
during a Google sign-in; both set by the account service for its own host, so the website's pages
never read them; and the note in local storage that the browser signed in, for the footer.

- Source: #468 ([Account pages](account.md)); Better Auth's cookies as the account service sets
  them ([`account-api.md`](../../../../docs/agents/account-api.md), Sign-in).
- Check: `apps/web/e2e/privacy.spec.ts`, "names what the website can do with the account, and each
  thing signing in keeps in the browser": the website's list, item for item, and the cookies, with
  their names and lifetimes.

**Tomodachi.** The page names Tomodachi, the companion app for Mac and iPhone, and says it works
without an account, keeps its own progress in the learner's iCloud, and that the policy covers what
it does with a Zenbu account. Linked to one, it can only read the learner's lists and known words,
mark words Known without ever clearing a mark, and fetch word cards and the segmentation of typed
answers from the dictionary service, which adds neither to the account and doesn't log them. The
page says it will name what another app can do before it lets the learner sign in.

- Source: #563 decisions 4, 5, and 6; #570 (Tomodachi's scopes); #571.
- Check: `apps/web/e2e/privacy.spec.ts`, "names Tomodachi and the only things it can do with the
  account": the section's statements, and its list of what Tomodachi can do, item for item, so a
  fifth fails it.

**Where it's kept, and who processes it.** The account's database is on the API servers, behind
Cloudflare, and is backed up each night to private Cloudflare R2 storage, each backup deleted after
30 days. The processors are Cloudflare (traffic, email, and backups) and the company that hosts the
API servers, which the page doesn't name. Apple and Google sign the learner in under their own
terms and send only what the account section lists.

- Source: #563 decisions 1 to 3; #565 (the service and its backups).
- Check: `apps/web/e2e/privacy.spec.ts`, "names where account data is kept and who processes it":
  the section's statements, and its list of processors, item for item.

**Retention, a copy, and deletion.** The page says how long each kind of account data is kept: the
account and its synced data until it's deleted; a session until sign-out or the account's deletion,
working for 60 days after its last use and deleted within an hour of that; codes and nonces for 10
minutes, deleted within an hour of that; request counts for a day after their last request; each
sync request's result for 30 days, and until the next change synced after that; each backup for 30
days. A learner deletes the account on the website or from any app that can make one, which
removes the account, its ways to sign in, and its synced data at once; backups age out within 30 days, and each device keeps
its own data and works signed out. There's no export feature: a learner asks
`support@zenbujapanese.com` for a copy (the owners confirm this on #575).

- Source: #574 (deletion, and the hourly purge of expired sessions, codes, and request counts); #565
  (the backups' 30 days); #567 (sessions and sync results).
- Check: `apps/web/e2e/privacy.spec.ts`, "says how long account data is kept, how to get a copy, and
  how to delete it": the retention list, item for item, the deletion, and the support email link.

**The rest of the policy.** The app's on-device data names the profile and the Media Library's
photos, and says an Image Search image is kept in the Media Library once a word is opened from it,
as the app's [Image Search](../../../ios/docs/product/dictionary.md#image-search) docs say. The
app's network features add signing in and syncing, only with an account, and say Cloudflare serves
the optional dictionaries. Its permissions, the website's hosting and analytics, support email, and
children are as they were; changes and contact name the account service too.

- Source: the policy of September 28, 2026; the app's
  [Account](../../../ios/docs/product/index.md#account) docs (the profile and the Media Library).
- Check: `apps/web/e2e/layout.spec.ts`, "/legal/privacy/ fits the window, with the site's header and
  footer". The text: No automated check yet.
