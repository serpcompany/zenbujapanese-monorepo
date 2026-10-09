---
status: accepted
---

# Build iPhone, iPad, and Mac from one native SwiftUI app

The app in `apps/ios` builds for iPhone, iPad, and the Mac from one app target and one Swift
package, as a native SwiftUI app on each: not Mac Catalyst, and not the iPhone app running
"Designed for iPhone" on a Mac.

- **One bundle ID, one App Store record.** Every platform ships as `com.zenbujapanese.dictionary`, with
  universal purchase: a learner who has it on one device has it on the others.
- **The Mac is Apple silicon only, on macOS 26.** iPhone and iPad stay on iOS 26.
- **Sync goes through the Zenbu account** (ADR 0013), the same as between two iPhones. There is no
  iCloud or CloudKit sync.
- **All four tabs ship on every platform.** A feature that can't work on a platform is hidden
  there, and its product doc says why. On the Mac the camera is optional: Image Search leads with
  files, the photo library, paste, and drag and drop, with Continuity Camera from an iPhone or
  iPad.
- **Platform differences live in one folder.** `SearchExperience/Platform/` holds every
  `#if os(...)`, every `UIKit` and `AppKit` import, and the small adapters and view extensions
  that hide them: images, colors, the pasteboard, the Settings link, keeping the screen awake,
  the audio session, web views, the camera, background refresh, the window that presents
  sign-in, and the iPhone-only modifiers. Feature code calls those and stays the same on every
  platform.
- **Containers adapt; screens stay shared.** The tab shell becomes a sidebar on iPad and the Mac,
  and the Mac adds menus, keyboard shortcuts, and a Settings window, but every detail screen is
  the same view on every platform.

## Why

- **The code was already shared.** Almost all of the app is the `apps/ios/Modules` package, which
  declared macOS 26 already for the Translate engine (ADR 0012). Of `SearchExperience`'s 137
  files, 37 used iPhone-only APIs, and each has a standard Mac counterpart behind a small adapter.
- **`#if os(...)` costs nothing at run time,** since it's resolved when the app is built. The cost
  is building and testing two platforms: a change can break the Mac while the iPhone stays green.
  Keeping the conditionals in one folder, which `pnpm verify layers` enforces, keeps that cost in
  a few known files, and stops an iPhone-only API from reaching feature code even while CI has no
  macOS runner.
- **One bundle ID keeps sign-in unchanged.** Sign in with Apple's token names the bundle ID, and
  the account service takes only the IDs it lists; Google's iOS client is already in its
  `GOOGLE_CLIENT_IDS`. A separate Mac bundle ID would need its own entry in the service, its own
  App ID in Apple Developer, and its own record.
- **Apple silicon only is no real loss.** Apple stopped selling Intel Macs in 2023, macOS 26 is
  the last release for Intel, the Sudachi binary has no Intel slice, and Foundation Models need
  Apple silicon.
- **The account already syncs between devices.** Known words, lists, watch history, and Translate
  bookmarks sync through the Zenbu account (#563), so the Mac signs in like a second iPhone. A
  second sync system would disagree with the first.

## Considered

- **"Designed for iPhone" on Apple silicon Macs.** No work, but a phone-sized window with no
  menus, keyboard shortcuts, or Settings window. A free experiment, not a product.
- **Mac Catalyst.** Meant for UIKit apps, and still an iPad app on a Mac. Apple's direction for
  SwiftUI apps is native macOS.
- **A separate Mac app, or a copy of the code.** Two bundle IDs, two records, and two sets of
  screens that drift apart.
- **iCloud or CloudKit sync.** Learners already sign in to sync with every Zenbu app and the
  website; iCloud would reach only Apple devices and disagree with the account.

## Consequences

- CI builds the app for iPad and the Mac only on the opt-in macOS runner (`IOS_SWIFT_TESTS`,
  [`docs/agents/ci.md`](../agents/ci.md)): there the package's tests run on an iPhone Simulator,
  the package and its tests build for the Mac, and the app builds for an iPad Simulator and the
  Mac. The owners keep it off for the runner's cost, so until then a Mac build is checked by hand
  ([`docs/agents/ios.md`](../agents/ios.md)), and `pnpm verify layers` catches the iPhone-only
  APIs it knows.
- The Mac app runs in the App Sandbox, with only what it uses: the microphone (Translate),
  outgoing connections, and files the learner picks. It never captures from a camera itself;
  Continuity Camera hands it a photo taken on an iPhone or iPad, which needs no camera access. It
  has no `BGAppRefreshTask`, so it syncs while it's open.
- Releasing it needs a person: the Mac platform added to the App Store record, macOS provisioning
  for the App ID's Sign in with Apple and Associated Domains, Mac and iPad screenshots, and App
  Review for both.

## What this changes

- **[Issue 16](https://github.com/serpcompany/zenbujapanese-monorepo/issues/16):** its platform
  baseline is superseded where it made the app iPhone-only and portrait-only and deferred iPad and
  Mac. The app now runs on iPhone in portrait, on iPad in every orientation and in multitasking,
  and on the Mac in resizable windows. Its iOS 26 floor, English interface, and accessibility
  baseline stand.
- **[ADR 0012](0012-run-the-on-device-recognizer-on-the-mac-from-its-own-target.md):** the macOS
  test target it set aside, because `SearchExperience` didn't build for the Mac, is now possible.

The owners decided this on 2026-10-08, on
[issue 661](https://github.com/serpcompany/zenbujapanese-monorepo/issues/661): one native
multiplatform SwiftUI app, iPad too, one record with universal purchase, Apple silicon only, sync
through the Zenbu account, and a camera that is optional on the Mac.
