# App Store privacy labels

The answers to enter under App Privacy in App Store Connect for the Zenbu Japanese app and for
Tomodachi, once each can sign in to a Zenbu account. They follow what the
[Privacy Policy](product/privacy.md) says a Zenbu account keeps, and change with it.

Enter them with the first build that signs in: the Zenbu app's 2.0.0 (#573, #797), and
Tomodachi's linking ([tomodachi-app#28](https://github.com/serpcompany/tomodachi-app/issues/28)).
Until then, an app's current answer, Data Not Collected, stays true.

## How Apple asks

In App Store Connect, open the app, then App Privacy, then Get Started (or Edit):

1. "Do you or your third-party partners collect data from this app?" Yes.
2. Select the data types in the table below, and no others.
3. For each one, set its purpose, whether it's linked to the user's identity, and whether it's used
   for tracking.

Apple counts data as collected when it leaves the device and is kept longer than it takes to
answer the request. Data kept only on the device, or in the learner's own iCloud, isn't collected.

## The answers for both apps

| Apple's data type | What the account keeps | Purpose | Linked to the user | Used for tracking |
| --- | --- | --- | --- | --- |
| Contact Info → Email Address | The account's email, or Apple's relay address if the learner hides theirs. Sign-in codes, and notices when a way to sign in is added or removed, go to it. In the Zenbu app, a problem report also sends an email for a reply: the account's, filled in when signed in, or one the learner types. Sentry keeps it. | App Functionality | Yes | No |
| Contact Info → Name | The optional name, typed by the learner or sent by Apple or Google at sign-up. | App Functionality | Yes | No |
| Identifiers → User ID | The Zenbu user ID, the optional username, and the learner's account ID at Apple or Google for each way they sign in. | App Functionality | Yes | No |
| User Content → Other User Content | The known words and lists synced to the account. | App Functionality | Yes | No |
| Other Data → Other Data Types | Each session's IP address and user agent, kept for security with the session, and the address of a profile picture the provider sends at sign-up. | App Functionality | Yes | No |

Neither app tracks: answer No to tracking for every type. The App Store then shows Contact Info,
Identifiers, User Content, and Other Data under Data Linked to You, and nothing under Data Used to
Track You or Data Not Linked to You.

Every other type is not collected. The ones a reviewer may ask about:

- **Location**, precise or coarse: no. The IP address isn't used to locate anyone; it's answered
  under Other Data Types.
- **Device ID**: no, but for the Zenbu app's install ID (below). The account keeps no device or
  advertising identifier.
- **Photos or Videos**: no for Tomodachi, whose account keeps at most a profile picture's address
  (Other Data Types). The Zenbu app syncs photos (below).
- **Search History**: no for Tomodachi, and the dictionary service answers its word-card and
  segmentation requests without keeping them. The Zenbu app syncs recent searches (below).
- **Usage Data and Diagnostics**: no, but for the Zenbu app's Product Interaction and its crash
  and problem reports (below). The services' request logs hold each request's method, route,
  status, and timing, and nothing the learner sent or that identifies them. The API host's nginx
  access log is configured outside this repository: if it keeps IP addresses or full URLs, answer
  Other Diagnostic Data under Data Not Linked to You, or turn it off.
- **Customer Support**: no, but for the Zenbu app's problem reports (below). Other support is by
  email, outside the apps.

## The Zenbu Japanese app

All five types above, four more for what only it syncs (#867): the watch history from its Player
(`watch:read` and `watch:write`), its settings, its photos (`photos:*`, and the profile photo with
`profile`), and its recent searches (`searches:*`); one for the subscription it sells (#868); and
four for the crash reports and problem reports it sends to Sentry
([`crash-reports.md`](../../ios/docs/product/crash-reports.md),
[`problem-reports.md`](../../ios/docs/product/problem-reports.md)). A problem report also sends an
email for a reply, answered under Email Address: the account's, filled in when signed in, or one
the learner types. With 2.1.0 (#932), App Privacy adds Purchase History, Photos or Videos, and
Search History, and answers settings as Product Interaction.

| Apple's data type | What the account keeps | Purpose | Linked to the user | Used for tracking |
| --- | --- | --- | --- | --- |
| Browsing History | The 50 YouTube videos the learner most recently watched in the app: each video's ID, title, channel, and length, and when they last watched it; the IDs of up to 100 they removed or that fell past the 50, with when; and, for 30 days, the result of each change the app sent, naming the video and when. | App Functionality | Yes | No |
| Usage Data → Product Interaction | For each of those videos, where the learner stopped and the share of its captions' words they know; and the app's settings: Reading Aids, Translate's furigana and speech speed, search results' sort and filter, Image Search's view, and the frequency dictionaries chosen. | App Functionality | Yes | No |
| Photos or Videos | The Media Library's photos, each file as the app saved it with its name and the words it's on, and the profile photo. A file is kept in Cloudflare R2 until its photo is deleted, or 30 days after its last word is removed; the account remembers the IDs of up to 1,000 deleted photos, and of each photo's latest 500 removed words. | App Functionality | Yes | No |
| Search History | The 50 searches the learner most recently made in the app, each query and when, and the IDs of up to 100 they removed or that fell past the 50, each an HMAC of the query that can't be turned back into it. | App Functionality | Yes | No |
| Purchases → Purchase History | The App Store subscription the app sends after a purchase or a restore: its product, status, renewal, and the transactions and refunds Apple reports, so it unlocks syncing on every device. | App Functionality | Yes | No |
| Identifiers → Device ID | A random ID made for this install, which every crash report and problem report from it carries. A problem report's email, which can be the account's, links it, and so that install's reports, to the person. Sentry keeps it. | App Functionality | Yes | No |
| User Content → Customer Support | What the learner writes in a problem report, without file paths, links, and email addresses. Sentry keeps it. | App Functionality | Yes | No |
| Diagnostics → Crash Data | A crash's or freeze's stack trace, the app's and system's versions, and the device's model and state, with the install ID. Sentry keeps it. | App Functionality | Yes | No |
| Diagnostics → Other Diagnostic Data | A code for a handled failure, such as an account sync's, and its HTTP status, never the error's message; and a problem report's details: the version and build, the system version, the device's model, signed in or out, crash reports on or off, the optional dictionaries installed, and the microphone and camera permissions. Each with the same details and install ID. | App Functionality | Yes | No |

The App Store then also shows Browsing History, Usage Data, Photos or Videos, Search History,
Purchases, and Diagnostics under Data Linked to You, and nothing under Data Not Linked to You.
Crash data is linked because a problem report shares its install ID and can carry the account's
email ([ADR 0021](../../../docs/adr/0021-send-problem-reports-through-the-crash-reports-sentry-setup.md)).
Crash reports are on until the learner turns off **Send Crash Reports**, a problem report goes
only when the learner sends one, and Debug builds never send either. Its Other User Content is the
known words and lists it syncs, with each word's state, Learning included (#1035), the word notes
the learner writes (each note's text and the word it's on; the account remembers the IDs of up to
1,000 deleted ones), and the Translate sentences
the learner bookmarks: each one's text and translation, its language, and when it was bookmarked
(or said, for one bookmarked before the app synced bookmarks), which may be what someone nearby
said. It never sends a conversation, or a sentence the learner didn't bookmark, and it keeps no
audio, so it collects no Audio Data. It has no analytics SDK.

It declares no Performance Data, though Sentry's own manifest, in the app's `Sentry.framework`
stub, lists it beside the two Diagnostics types, so Xcode's privacy report for the app shows it.
The app measures nothing: tracing, profiling, app-start measurement, MetricKit, and Sentry's
metrics are off (`CrashReporterOptionsTests`), and a freeze is one report with its stack trace,
not a launch time or hang rate. Declare it if any of those is turned on.

Its privacy manifest, `apps/ios/App/PrivacyInfo.xcprivacy`, lists the same fourteen types, and the
listing's description, in `apps/ios/metadata/version/2.1.0/en-US.json`, says what syncs. Change them
with the labels:

- **The privacy manifest**: one dictionary per type in the `NSPrivacyCollectedDataTypes` array. Each has the keys `NSPrivacyCollectedDataType` (the
  type: `NSPrivacyCollectedDataTypeEmailAddress`, `NSPrivacyCollectedDataTypeName`,
  `NSPrivacyCollectedDataTypeUserID`, `NSPrivacyCollectedDataTypeOtherUserContent`,
  `NSPrivacyCollectedDataTypeOtherDataTypes`, `NSPrivacyCollectedDataTypeBrowsingHistory`,
  `NSPrivacyCollectedDataTypeProductInteraction`, `NSPrivacyCollectedDataTypePurchaseHistory`,
  `NSPrivacyCollectedDataTypePhotosorVideos`, or `NSPrivacyCollectedDataTypeSearchHistory`; for
  crash and problem reports, `NSPrivacyCollectedDataTypeDeviceID`,
  `NSPrivacyCollectedDataTypeCustomerSupport`, `NSPrivacyCollectedDataTypeCrashData`, and
  `NSPrivacyCollectedDataTypeOtherDiagnosticData`), `NSPrivacyCollectedDataTypeLinked` (true),
  `NSPrivacyCollectedDataTypeTracking` (false), and `NSPrivacyCollectedDataTypePurposes` (an array
  holding `NSPrivacyCollectedDataTypePurposeAppFunctionality`).
- **The listing's description**, which names what the account syncs.

## Tomodachi

All five types above, on each of its App Store records (Mac and iPhone). It signs in the same way,
so the account gets the email, a name if Apple or Google sends one, the user IDs, and each
session's IP address and user agent. Its Other User Content is the Known marks it sends. Reading
the learner's lists and known words adds no type, since the account already holds them.

Its privacy manifest lists the same five types, the way the Zenbu app's does.

Not collected:

- its own progress (Tomo, its words, and the learner's answers), which syncs through the learner's
  private iCloud database, which only the learner's devices read;
- once the dictionary service answers them (#571), word-card and segmentation requests, which it
  answers without keeping.

The first is as Tomodachi works today, in its
[architecture doc](https://github.com/serpcompany/tomodachi-app/blob/main/docs/architecture.md).
It uses no microphone or speech recognition: its answers are choices, and neither app's
`Info.plist` asks for either
([tomodachi-app#105](https://github.com/serpcompany/tomodachi-app/issues/105)).

Tomodachi's owners also answer for what isn't the account's:

- **Its conversation AI**, which only Debug builds have today (its architecture doc), goes to the
  provider and key the learner sets in Settings → AI. If Tomodachi ships with a provider of ours,
  what it sends is collected by a third-party partner (User Content), and both these labels and
  the Privacy Policy need it.
- **Analytics or crash reporting**, if it adds any.
