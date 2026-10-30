# The extension's settings

How the browser extension's settings ([`extension.md`](extension.md)) are kept, read, and passed
to pages, and the permissions the side panel's header uses. What a learner sees is in the
[product docs](../../apps/extension/docs/product/index.md): Settings and the
[side panel header](../../apps/extension/docs/product/side-panel-header.md). How the header finds
the active tab's site is in [`extension-side-panel.md`](extension-side-panel.md).

## Code

- `src/shared/settings.ts`: the keys, their defaults (`settingDefaults`), how a stored value reads
  (`settingFrom`, `settingsFrom`), and the channel to content scripts. It has no React, since the
  service worker imports it. `use-settings.ts` is the hook pages read them with.
- `src/settings/`: Settings, the sidebar and its six pages, the Account page being the shared
  account component ([`account-extension.md`](account-extension.md), In the extension); the switch row and when Hide
  Furigana on Known Words waits (`setting-switch.tsx`), which the header's menu shares; the
  frequency dictionaries' order (`frequency-order.ts`); and the text both use (`labels.ts`).
- `src/service-worker/settings.ts`: answers a content script's ask and its write, and tells open
  tabs of a change.
- `test-pages/settings-follower.tsx`: the test content script's follower, which draws nothing on
  a site Zenbu is off on, draws again when a setting changes, without a reload, and lists each
  reading aid's state.

## How they're kept

Each setting is a key of its own in `chrome.storage.local`, with its default in
`settingDefaults`; a stored value of the wrong kind reads as the default (`settingFrom`). Send
Crash Reports' gate in the service worker (`src/error-reports/report-setting.ts`) reads its key
the same way. The side panel's header and Settings read and write the storage directly, with
`useSettings`, and redraw on `chrome.storage.onChanged`. A content script never reads the
storage: it asks the service worker with `askSettings()` (`{ target: 'service-worker', settings:
'read' }`), and the service worker, which watches the storage, sends `{ target: 'settings',
settings }` to every open tab when one changes, which `onSettingsChanged` hears. One content
script writes settings: the YouTube one keeps `captionPlaceKeys`, `videos.captionPlace` and
`videos.translationPlace`, where the learner dragged the Japanese box and the English box, or
`null` once a double-click puts one back. It asks the service worker to write it, with
`askToWriteSettings()` (`{ target: 'service-worker', settings: 'write', changes }`), since the
service worker closes `chrome.storage.local` to content scripts to keep the account's session
token from them ([`account-extension.md`](account-extension.md)); the service worker keeps only
the changes whose key and kind fit (`fittingChanges`), and the content script hears them back the
same way. From a sender outside the extension's own origin it takes only `captionPlaceKeys`, and
refuses a write that holds any other key, so a page that took over its renderer can't turn crash
reports back on or a site back on (`src/shared/settings.test.ts`, "takes only the caption boxes’
places from a content script…"). A tab that can't
take the message (a closed tab, a page with no content script) stops none of the others. Whether
Zenbu runs on a site is `isZenbuOn(host, settings)`, from `sites.off`, and whether the page script
reads a page's text is `readsPageText(host, settings)`, which also needs Page Text
(`pages.pageText`), kept in the browser alone, like Zenbu Captions.

## Permissions

The manifest's `permissions` are `offscreen`, for the offscreen document that holds the
dictionary; `sidePanel`, for the side panel; `storage`, for the settings; `activeTab`, so a click
on the toolbar icon shows the header the tab's address; `unlimitedStorage`, for the language data
the extension keeps on the device; `alarms`, for the daily language-data update check;
`scripting`, to register the page lookup script on the sites the user allows;
`declarativeNetRequestWithHostAccess`, for the rule that removes the `origin` header from the
extension's own YouTube caption requests; and `identity`, for Google's and Apple's sign-in windows
(`chrome.identity.launchWebAuthFlow`). Its `host_permissions` are the language data host
(`https://data.zenbujapanese.com/*`, in the test build `http://language-data.localhost/*`), the
account service's (`https://api.zenbujapanese.com/*`, `https://api-staging.zenbujapanese.com/*`
in staging, `http://account-api.localhost/*` in the test build), and `https://www.youtube.com/*`,
for the YouTube content script and the caption requests; the test build adds
`http://allowed.localhost/*`, which the tests use as an allowed site. The hosts together add one
install warning, which names the three: "Read and change your data on api.zenbujapanese.com,
data.zenbujapanese.com, and www.youtube.com" (`chrome.management.getPermissionWarningsById` on the
production build, in Playwright's Chromium 153, by an agent on 2026-10-30; staging names its own
API host); the other permissions add none, `identity` included. It asks
for no other site at install: `http://*/*` and `https://*/*` are the only
`optional_host_permissions`, the only access asked for later, and the header menu's Allow on This
Site asks Chrome for one site with `chrome.permissions.request`, as Turn On for Every Site does
for `http://*/*` and `https://*/*`, on the welcome tab and in Sites
(`src/shared/every-site.tsx`). It never asks for `tabs`, which would warn that it reads the
browsing history.

## Checks

- **Unit and DOM tests,** with `pnpm test` in `apps/extension`: the settings' defaults, storage,
  and channel (`src/shared/settings.test.ts`); Send Crash Reports taking its default and kind from
  `settingDefaults` (`src/error-reports/report-setting.test.ts`); and, in happy-dom on one fake
  Chrome (`src/test/fake-chrome.ts`, `src/test/extension.tsx`), Settings and the header with the
  test content script beside them, each behavior their product docs list.
- **In Chrome,** in the agent Chrome harness ([`extension.md`](extension.md), Checks): open
  Settings, turn a reading aid and a site off and on, and see the test page follow without a
  reload.
