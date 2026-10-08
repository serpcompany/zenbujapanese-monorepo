# Privacy Policy

`/legal/privacy/` is the privacy policy for the Zenbu Japanese iPhone app, the website, and the
Zenbu account, including Tomodachi's use of it. The shipped app and its App Store listing reach it
through `/privacy` ([App links](dictionary.md#header-footer-and-site-wide)). Its text is
`apps/web/src/app/legal/privacy/page.tsx`. Each behavior below says what the page says, where it
comes from, and the automated check that enforces it (see
[How behavior is verified](index.md#how-behavior-is-verified)).

Since #681 the page says what a privacy policy has to, in plain language, and leaves out how the
services work: App Store Review Guideline 5.1.1, GDPR Article 13, and the CCPA's notice
requirements set what it covers. It is a short version of five points, then about 1,000 words in
sections, with two tables, for what an account keeps and how long. Cookie names, browser storage,
sign-in mechanics, field-by-field lists, per-timer retention, and Tomodachi's permission list are
condensed into categories or one line each. The page never says whether an app or the website
signs in today: everything in the app works without an account, and the page says what happens
"if you create or sign in to a Zenbu account where our apps or this website offer one", so it holds
before and after sign-in opens in the app (#573) and on production's website. When the service
keeps something new, keeps it longer, sends email through another provider, or an app gets a new
scope, change the page, its Effective date, this doc, and the
[App Store privacy labels](../app-store-privacy-labels.md) in the same pull request. The owner
approves the text before it merges, since it is legal copy.

Abbreviations: **Privacy spec** is `apps/web/e2e/privacy.spec.ts`, the page's browser tests at a
desktop and a phone width.

## Sections

**The short version.** Five points: the app works without an account and keeps what the learner
does on the device; an account keeps the email, how they sign in, and the study data they sync; we
don't sell or share personal information, and the app (not the website, which counts visits) has
no ads, analytics, or tracking; a few companies help run the service, Cloudflare and useSend among
them; and they can see, export, correct, or delete their data, and delete the account.

- Source: #681; the owner's answers on #683 (no sale or sharing); the
  [App Store privacy labels](../app-store-privacy-labels.md) (no analytics or crash-reporting SDK,
  and no tracking).
- Check: Privacy spec, "opens with a short version in five points".

**Who we are.** TSMC LLC, doing business as Zenbu Japanese, with its postal address and phone
number, and `support@zenbujapanese.com` for anything about the learner's data. The company's
details are `company` in `src/lib/company.ts`, which the DMCA page's designated agent uses too, so
there's one copy. Neither page names an EU representative.

- Source: the [Terms of Use](../../src/app/legal/terms/page.tsx); the DMCA page's company details,
  as the owner pointed to on #683; #681 (GDPR Article 13's identity and contact).
- Check: Privacy spec, "says who we are and how to reach us".

**On your device.** A learner never needs an account. The app keeps the profile, searches, notes,
known words, lists, watch history, photos, and Translate conversations in its private storage, and
sends none of it unless the learner signs in, and then only what the account section lists. It
stays until deleted in the app or the app is uninstalled, which doesn't delete the account; device
backups such as iCloud Backup can include it. Image Search, Translate, text recognition, and
speech run on the device with Apple's frameworks; Translate uses the microphone only while a
conversation or Listening runs, hears whoever speaks nearby, keeps no audio, and never sends a
conversation. The app asks for the camera and microphone only when a feature needs them. Player's
requests, its caption translations included, go to YouTube, and optional dictionaries come
through Cloudflare.

- Source: the app's [Account](../../../ios/docs/product/index.md#account),
  [Image Search](../../../ios/docs/product/dictionary.md#image-search), and
  [Translate](../../../ios/docs/product/translate.md) docs ("Nothing anyone says is sent to a
  server"; conversations "never sync"); [Player](../../../ios/docs/product/player.md).
- Check: Privacy spec, "says what stays on the device, and that the app works without an account".

**Your Zenbu account.** Signed out, the apps send the account service nothing. The first table
names what an account keeps, by category, and why: the account (the email, and a name, username,
and profile picture link if the learner or the provider at sign-up gives one), how they sign in
(Apple, Google, or an emailed code, with their ID at Apple or Google), sessions (each device or
browser, with its IP address and user agent), study data (known words and lists, and from the
iPhone app the 50 most recently watched Player videos and the bookmarked Translate sentences),
and a record of each synced change, so a change sent twice applies once. Expired sessions, codes,
and counts go within an hour (said under the second table), and a removed video, list, or bookmark
leaves only a record that it was removed. The app's profile, notes, photos, searches, settings, and whole conversations don't
sync; a bookmarked sentence may be someone else's words, so only bookmarked ones leave the device.
The account service emails only sign-in codes, a way to sign in added or removed, and a deletion's
confirmation. Where the website offers sign-in, the account there changes the name and username,
manages how the learner signs in, signs out, and deletes the account, and doesn't read study data
yet; signing in uses cookies only to sign in and stay signed in, and the website remembers the
theme and that the learner is signed in. Tomodachi works without an account and keeps its progress
in the learner's iCloud; linked, it can read lists and known words, mark words Known, and delete
the account when asked, and looks words up in the dictionary service, which keeps none of it. The
page says it will change before an app or the website syncs anything else, or before another app
can use the account.

- Source: [`account-api.md`](../../../../docs/agents/account-api.md) (Sign-in, Email, Profiles and
  sync); [`account-clients.md`](../../../../docs/agents/account-clients.md) (Your app: each app's
  scopes; The website); the app's
  [Zenbu account and sync](../../../ios/docs/product/index.md#zenbu-account-and-sync) docs;
  [Account pages](account.md); the
  [App Store privacy labels](../app-store-privacy-labels.md) (Tomodachi's iCloud).
- Check: Privacy spec, "names each kind of data an account keeps, and why", and "says what stays on
  the device, and that the app works without an account" (nothing sent signed out, "where our apps
  or this website offer one", what doesn't sync). The email's uses, the website's and Tomodachi's
  lines: No automated check yet.

**Who else handles your information.** The section opens by saying we don't sell or share
personal information, then lists who handles it for us: Cloudflare (this website, downloads,
requests to the servers, the backups, and forwarding the support address's email, through Email
Routing), useSend (email, which keeps copies of what it sends), Lambda, Inc. (Lambda Labs, in the
United States, the machines the account database runs on), Ahrefs (Ahrefs Web Analytics, which
counts the website's visits without cookies), Google (Google Tag Manager, which loads Ahrefs'
script, the support mailbox, on Google Workspace, and sign-in with Google), Apple (sign-in with
Apple), and YouTube (Player). These companies may process information in the United States and
other countries; the page names no particular safeguard. Adding anything to Google Tag Manager
that uses cookies means updating the page and asking for consent where the law requires it.

- Source: #563 decisions 1 to 3; #565 (the backups on R2); the owners' choice of useSend on
  2026-10-07 ([`account-api.md`](../../../../docs/agents/account-api.md), Email); the owner's
  answers on #683, dated October 8, 2026 (production's Google Tag Manager container,
  `GTM-MCNL5QH4`, has one tag, a Custom HTML tag loading Ahrefs Web Analytics; production runs no
  Cloudflare Web Analytics beacon; the server host; the support mailbox; useSend's copies); and
  `src/components/analytics.tsx` and [`web.md`](../../../../docs/agents/web.md) (analytics only
  in production).
- Check: Privacy spec, "names who else handles the information": the list, item for item, and
  the no-sale, transfer, and consent lines.

**How long we keep it.** The second table: the account and study data until it's deleted; sessions
until sign-out, or 60 days after their last use; sign-in codes 10 minutes; request counts by IP
address a day after the last request; each synced change's record 30 days, and then until the next
change synced; backups 30 days; support email as long as it's needed.

- Source: [`account-api.md`](../../../../docs/agents/account-api.md) (Sign-in, Profiles and sync,
  Deleting an account, Back up and restore); #574 (the hourly purge of what has expired).
- Check: Privacy spec, "says how long each kind of data is kept", row for row.

**Why we're allowed to use it.** The legal basis for each use: the account, synced data, and the
account's emails are needed to provide the account; sessions, request counts, backups, running
the website and downloads, and visit counting rest on the legitimate interest in a secure, reliable
service; support email on the legitimate interest in answering.

- Source: #681 (GDPR Article 13(1)(c)).
- Check: Privacy spec, "gives the legal basis for each use".

**Your rights.** See and export (by email to support, since there's no export feature; the owners
confirm this on #575), correct (the name and username on the website where it offers sign-in,
since the app's profile is its own; the email or anything else by email to support, which can
change an account's email by hand), delete (in any
app that makes accounts, or on the website where the learner can sign in to the account; it
removes the account and its synced data at once, backups within 30 days, and each device keeps its
own data), and object or restrict. The page says using these rights changes nothing for the
learner, and that they can complain to their data protection authority.

- Source: #574 (deletion); #575 (a copy by email); the owner's answers on #683 (support corrects
  an email by hand); #681 (GDPR Articles 13(2)(b) and (d), and the CCPA's rights).
- Check: Privacy spec, "names the rights to see, export, correct, and delete, and to complain".

**Children, changes, and contact.** Zenbu Japanese is a general-audience reference, not directed
to children under 13, and an account we learn belongs to a child under 13 is deleted. The page is
updated when the apps, services, or website change how they
handle information, and the Effective date marks the current version. Questions go to the support
email, and the page links the Terms of Use.

- Source: the policy of September 28, 2026; the owner's answers on #683 (13, and deleting a
  child's account).
- Check: Privacy spec, "covers children and changes, with the date of this version";
  `e2e/layout.spec.ts`, "/legal/privacy/ fits the window, with the site's header and footer".
