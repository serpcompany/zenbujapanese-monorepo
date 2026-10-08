# App Store privacy labels

The answers to enter under App Privacy in App Store Connect for the Zenbu Japanese app and for
Tomodachi, once each can sign in to a Zenbu account. They follow what the
[Privacy Policy](product/privacy.md) says a Zenbu account keeps, and change with it.

Until a build that signs in is submitted, each app's current answer, Data Not Collected, stays
true. Enter these with that build: the Zenbu app's sign-in (#573), and Tomodachi's linking
([tomodachi-app#28](https://github.com/serpcompany/tomodachi-app/issues/28)).

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
| Contact Info → Email Address | The account's email, or Apple's relay address if the learner hides theirs. Sign-in codes, and notices when a way to sign in is added or removed, go to it. | App Functionality | Yes | No |
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
- **Device ID**: no. The account keeps no device or advertising identifier.
- **Photos or Videos**: no. Photos stay on the device; the account keeps at most a profile
  picture's address (Other Data Types).
- **Search History**: no. Searches stay on the device, and the dictionary service answers
  Tomodachi's word-card and segmentation requests without keeping them.
- **Usage Data and Diagnostics**: no, but for the Zenbu app's Product Interaction (below). The
  services' request logs hold each request's method, route, status, and timing, and nothing the
  learner sent or that identifies them. The API host's
  nginx access log is configured outside this repository: if it keeps IP addresses or full URLs,
  answer Other Diagnostic Data under Data Not Linked to You, or turn it off.
- **Customer Support**: no. Support is by email, outside the apps.

## The Zenbu Japanese app

All five types above, and two more for the watch history it syncs from its Player, which only it
reads and changes (`watch:read` and `watch:write`):

| Apple's data type | What the account keeps | Purpose | Linked to the user | Used for tracking |
| --- | --- | --- | --- | --- |
| Browsing History | The 50 YouTube videos the learner most recently watched in the app: each video's ID, title, channel, and length, and when they last watched it; the IDs of up to 100 they removed or that fell past the 50, with when; and, for 30 days, the result of each change the app sent, naming the video and when. | App Functionality | Yes | No |
| Usage Data → Product Interaction | For each of those videos, where the learner stopped and the share of its captions' words they know. | App Functionality | Yes | No |

The App Store then also shows Browsing History and Usage Data under Data Linked to You. Its Other
User Content is the known words and lists it syncs, and the Translate sentences the learner
bookmarks: each one's text and translation, its language, and when it was bookmarked, which may be
what someone nearby said. It never sends a conversation, or a sentence the learner didn't bookmark,
and it keeps no audio, so it collects no Audio Data. It has no analytics or crash-reporting SDK.

When the build with sign-in ships (#573), change these with the labels:

- **The privacy manifest**, `apps/ios/App/PrivacyInfo.xcprivacy`: add one dictionary per type to
  the `NSPrivacyCollectedDataTypes` array. Each has the keys `NSPrivacyCollectedDataType` (the
  type: `NSPrivacyCollectedDataTypeEmailAddress`, `NSPrivacyCollectedDataTypeName`,
  `NSPrivacyCollectedDataTypeUserID`, `NSPrivacyCollectedDataTypeOtherUserContent`,
  `NSPrivacyCollectedDataTypeOtherDataTypes`, `NSPrivacyCollectedDataTypeBrowsingHistory`, or
  `NSPrivacyCollectedDataTypeProductInteraction`), `NSPrivacyCollectedDataTypeLinked` (true),
  `NSPrivacyCollectedDataTypeTracking` (false), and `NSPrivacyCollectedDataTypePurposes` (an array
  holding `NSPrivacyCollectedDataTypePurposeAppFunctionality`).
- **The listing's description**, in `apps/ios/metadata/version/1.0/en-US.json`, which says the
  app has no cloud sync.

## Tomodachi

All five types above, on each of its App Store records (Mac and iPhone). It signs in the same way,
so the account gets the email, a name if Apple or Google sends one, the user IDs, and each
session's IP address and user agent. Its Other User Content is the Known marks it sends. Reading
the learner's lists and known words adds no type, since the account already holds them.

Its privacy manifest lists the same five types, the way the Zenbu app's does.

Not collected:

- its own progress, which syncs through the learner's private iCloud database, which only the
  learner's devices read;
- spoken answers, which it recognizes on the device;
- once the dictionary service answers them (#571), word-card and segmentation requests, which it
  answers without keeping.

The first two are as Tomodachi works today, in its
[architecture doc](https://github.com/serpcompany/tomodachi-app/blob/main/docs/architecture.md).

Tomodachi's owners also answer for what isn't the account's:

- **Its conversation AI** goes to the provider and key the learner sets in Settings → AI. If
  Tomodachi ships with a provider of ours, what it sends is collected by a third-party partner
  (User Content), and both these labels and the Privacy Policy need it.
- **Analytics or crash reporting**, if it adds any.
