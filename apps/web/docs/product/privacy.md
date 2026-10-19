# Privacy Policy

`/legal/privacy/` is the privacy policy for the Zenbu Japanese iPhone app, Tomodachi for iPhone
and Mac, the website, and the Zenbu account. The shipped apps and their App Store listings reach it
through `/privacy` ([App links](dictionary.md#header-footer-and-site-wide)). Its text is
`apps/web/src/app/[locale]/legal/privacy/page.tsx`. Each behavior below says what the page says, where it
comes from, and the automated check that enforces it (see
[How behavior is verified](index.md#how-behavior-is-verified)).

Since #681 the page says what a privacy policy has to, in plain language, and leaves out how the
services work: App Store Review Guideline 5.1.1, GDPR Article 13, and the CCPA's notice
requirements set what it covers. It is a short version of six points, then about 1,550 words in
sections, with two tables, for what an account keeps and how long. Cookie names, browser storage,
sign-in mechanics, field-by-field lists, per-timer retention, and Tomodachi's permission list are
condensed into categories or one line each. The page never says whether an app or the website
signs in today: everything in the app works without an account, and the page says what happens
"if you create or sign in to a Zenbu account where our apps or this website offer one", so it held
when production's website opened sign-in (#798), and holds before and after sign-in
opens in the app (#573). When the service
keeps something new, keeps it longer, sends email through another provider, an app gets a new
scope, or an app's reports send something new, change the page, its Effective date, this doc, and the
[App Store privacy labels](../app-store-privacy-labels.md) in the same pull request. The one
exception is a new kind of report: the page says what it sends before any build sends it, and the
labels and the app's privacy manifest change with that build, since they describe the app in the
App Store. The owner
approves the text before it merges, since it is legal copy.

Abbreviations: **Privacy spec** is `apps/web/e2e/privacy.spec.ts`, the browser tests of this page
and of the support page's Tomodachi line, at a desktop and a phone width.

## Sections

**The short version.** Six points: the app works without an account and keeps what the learner
does on the device; when it crashes or freezes it sends a report without anything the learner
reads, types, says, or photographs, unless they turn crash reports off, and a problem report sends
what they write; an account keeps the email, how they sign in, and the study data they sync; we
don't sell or share personal information, and the app (not the website, which counts visits) has
no ads, analytics, or tracking; a few companies help run the service, Cloudflare and useSend among
them; and they can see, export, correct, or delete their data, and delete the account.

- Source: #681; the owner's answers on #683 (no sale or sharing); the
  [App Store privacy labels](../app-store-privacy-labels.md) (no analytics, and no tracking); #904
  (the reports).
- Check: Privacy spec, "opens with a short version in six points".

**Who we are.** TSMC LLC, doing business as Zenbu Japanese, with its postal address and phone
number, and `support@zenbujapanese.com` for anything about the learner's data. The company's
details are `company` in `src/lib/company.ts`, which the DMCA page's designated agent uses too, so
there's one copy. Neither page names an EU representative.

- Source: the [Terms of Use](../../src/app/[locale]/legal/terms/page.tsx); the DMCA page's company details,
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
  [Image Search](../../../ios/docs/product/translate.md#image-search), and
  [Translate](../../../ios/docs/product/translate.md) docs ("Nothing anyone says is sent to a
  server"; conversations "never sync"); [Player](../../../ios/docs/product/player.md).
- Check: Privacy spec, "says what stays on the device, and that the app works without an account".

**Crash and problem reports.** Its own section, `/legal/privacy/#reports`, written before any
build sends a report (#904, Wave 0 of #864). Crash reports (#859) go to Sentry when the app
crashes, freezes, or is closed by iOS (a watchdog termination) while in use, and a handled failure
in account sync, an optional dictionary's install, the dictionary core, or Translate's start
checks sends a code for the step and how it failed, never the error's message. They're on by
default, and the **Send crash reports** switch in the app's Settings turns them off. A report holds
the stack trace, version and build, iOS version, device model and state, and a random install ID
that isn't linked to the account; never what the learner reads, types, says, or photographs, nor
location, device name, language, region, or time zone; and the app removes file paths and names,
links, email addresses, and quoted text from error messages. A problem report (#860), sent with
**Report a Problem…** in Settings, holds what the learner writes, an optional email for a reply,
and the details under **Included with your report** (version and build, iOS version, device model,
signed in or not, crash reports on or off, and the optional dictionaries installed); Sentry adds
the same details and install ID, so an email can be seen alongside the copy's other reports. It is
sent even with crash reports off. The app removes paths, links, and emails from what the learner
writes and keeps the rest, so the page says it can hold anything they type, and attaches nothing
else. Sentry receives the IP address and is set not to store it or its location. The app's labels
are in English in both languages, since its screens are. The services (#861) and the website
(#862) add their own lines when they report.

- Source: #859 and #860 (what each sends, its switch, and its labels); SERP's
  [native app error reporting](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/native-app-error-reporting.md)
  and [native app problem reports](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/native-app-problem-reports.md)
  standards (the IP setting, and what a policy says about a problem report); #904.
- Check: Privacy spec, "says what crash and problem reports send, what they never send, and how to
  turn crash reports off", and "/legal/privacy/#reports opens on the crash and problem reports,
  below the header".

**Your Zenbu account.** Signed out, the apps send the account service nothing. The first table
names what an account keeps, by category, and why: the account (the email, and a name, username,
and profile picture link if the learner or the provider at sign-up gives one), how they sign in
(Apple, Google, or an emailed code, with their ID at Apple or Google), sessions (each device or
browser, with its IP address and user agent), study data (known words and lists, and from the
iPhone app the 50 most recently watched Player videos and the bookmarked Translate sentences),
and a record of each synced change, so a change sent twice applies once. Expired sessions, codes,
and counts go within an hour (said under the second table), and a removed video, list, or bookmark
leaves only a record that it was removed. The app's profile syncs its name and username, which the
account keeps anyway; the profile's photo and email, notes, photos, searches, settings, and whole
conversations don't sync; a bookmarked sentence may be someone else's words, so only bookmarked
ones leave the device.
The account service emails only sign-in codes, a way to sign in added or removed, and a deletion's
confirmation. Where the website offers sign-in, the account there changes the name and username,
manages how the learner signs in, signs out, and deletes the account, and doesn't read study data
yet; signing in uses cookies only to sign in and stay signed in, and the website remembers the
theme and that the learner is signed in. The page says it will change before an app or the website
syncs anything else.

- Source: [`account-api.md`](../../../../docs/agents/account-api.md) (Sign-in, Email, Profiles and
  sync); [`account-clients.md`](../../../../docs/agents/account-clients.md) (The website); the app's
  [Zenbu account and sync](../../../ios/docs/product/account-sync.md) docs;
  [Account pages](account.md).
- Check: Privacy spec, "names each kind of data an account keeps, and why", and "says what stays on
  the device, and that the app works without an account" (nothing sent signed out, "where our apps
  or this website offer one", the app's profile, what doesn't sync). The email's uses and the website's lines: No
  automated check yet.

**Tomodachi.** Its own section, `/legal/privacy/#tomodachi`, which the support page links to.
Tomodachi needs no account or sign-in. It saves the learner's progress (Tomo, its words, and their
answers) on the device and syncs it through their own iCloud, in their CloudKit private database,
under Apple's terms; we run no server for it and can't see that progress. Its reminders are
notifications it schedules on the device, not push notifications from us; it has no ads,
analytics, or tracking, and doesn't use the microphone or speech recognition. The Mac app works the
same way, and opens at login only if the learner turns that on. Linked to a Zenbu account, it can
read lists and known words, mark words Known, and delete the account when asked, and it looks
words up in the dictionary service, which keeps none of it. The page says it will change before
another app can use the account. The heading lands below the pinned header, since the page's root
has a 64-pixel scroll padding (`scroll-pt-16` in `src/components/site-document.tsx`).

The support page (`/support/`) says Tomodachi's help goes to the same support address and links
this section, and both pages' descriptions name Tomodachi. Both fit a 320-pixel and a 390-pixel
phone without scrolling sideways, in light and dark.

- Source: #686; [tomodachi-app#105](https://github.com/serpcompany/tomodachi-app/issues/105), which
  lists what's true of the current build for App Store Review Guideline 5.1.1, since Tomodachi's App
  Store records and About screen link to `/privacy` and `/support`; its iPhone and Mac `Info.plist`,
  which ask for no microphone or speech recognition;
  [`account-clients.md`](../../../../docs/agents/account-clients.md) (Your app: each app's scopes);
  the [App Store privacy labels](../app-store-privacy-labels.md) (Tomodachi's iCloud).
- Check: Privacy spec, "/legal/privacy/#tomodachi opens on what the policy says about Tomodachi"
  (each fact, the heading below the header, and the description), "the support page sends Tomodachi
  help to the support address, and links its section" (the line, the link landing on the section,
  and the description), and "… fits a 320px phone, in light and dark" and "… fits a 390px phone, in
  light and dark", for both pages; smoke "the privacy policy and support page cover Tomodachi".

**Who else handles your information.** The section opens by saying we don't sell or share
personal information, then lists who handles it for us: Cloudflare (this website, downloads,
requests to the servers, the backups, and forwarding the support address's email, through Email
Routing), useSend (email, which keeps copies of what it sends), Lambda, Inc. (Lambda Labs, in the
United States, the machines the account database runs on), Sentry (Functional Software, Inc., in
the United States, the app's crash and problem reports), Ahrefs (Ahrefs Web Analytics, which
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
  in production); the Sentry organization's region, `us.sentry.io`, for Sentry's country.
- Check: Privacy spec, "names who else handles the information": the list, item for item, and
  the no-sale, transfer, and consent lines.

**How long we keep it.** The second table: the account and study data until it's deleted; sessions
until sign-out, or 60 days after their last use; sign-in codes 10 minutes; request counts by IP
address a day after the last request; each synced change's record 30 days, and then until the next
change synced; backups 30 days; crash and problem reports up to 90 days; support email as long as
it's needed.

- Source: [`account-api.md`](../../../../docs/agents/account-api.md) (Sign-in, Profiles and sync,
  Deleting an account, Back up and restore); #574 (the hourly purge of what has expired); Sentry's
  [data retention periods](https://docs.sentry.io/security-legal-pii/security/data-retention-periods/)
  (errors kept 30 days on the Developer plan and 90 days on Team, Business, and Enterprise, set
  when an event arrives). The organization's plan wasn't visible to agents on 2026-10-20, so
  "up to 90 days" is the longest any plan keeps an error, and the owner confirms the plan (#904).
- Check: Privacy spec, "says how long each kind of data is kept", row for row.

**Why we're allowed to use it.** The legal basis for each use: the account, synced data, and the
account's emails are needed to provide the account; sessions, request counts, backups, crash
reports, running the website and downloads, and visit counting rest on the legitimate interest in
a secure, reliable service; support email and problem reports on the legitimate interest in
answering and fixing what's reported.

- Source: #681 (GDPR Article 13(1)(c)).
- Check: Privacy spec, "gives the legal basis for each use".

**Your rights.** See and export (by email to support, since there's no export feature; the owners
confirm this on #575), correct (the name and username on the website where it offers sign-in,
since the app's profile is its own; the email or anything else by email to support, which can
change an account's email by hand), delete (in any
app that makes accounts, or on the website where the learner can sign in to the account; it
removes the account and its synced data at once, backups within 30 days, and each device keeps its
own data; a problem report is deleted on request by email), and object or restrict. The page says using these rights changes nothing for the
learner, and that they can complain to their data protection authority.

- Source: #574 (deletion); #575 (a copy by email); the problem-report standard (deleting a report
  on request); the owner's answers on #683 (support corrects
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
