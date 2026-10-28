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
- `src/settings/`: Settings, the sidebar and its five pages; the switch row and when Hide
  Furigana on Known Words waits (`setting-switch.tsx`), which the header's menu shares; the
  frequency dictionaries' order (`frequency-order.ts`); and the text both use (`labels.ts`).
- `src/service-worker/settings.ts`: answers a content script's ask and tells open tabs of a
  change.
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
settings }` to every open tab when one changes, which `onSettingsChanged` hears. A tab that can't
take the message (a closed tab, a page with no content script) stops none of the others. Whether
Zenbu runs on a site is `isZenbuOn(host, settings)`, from `sites.off`.

## Permissions

Besides `offscreen` and `sidePanel`, the manifest asks for `storage`, for the settings, and
`activeTab`, so a click on the toolbar icon shows the header the tab's address. Neither adds an
install warning. It asks for no site at install: `http://*/*` and `https://*/*` are
`optional_host_permissions`, and the header menu's Allow on This Site asks Chrome for one site
with `chrome.permissions.request`. It never asks for `tabs`, which would warn that it reads the
browsing history, and nothing in it asks for every site (#957).

## Checks

- **Unit and DOM tests,** with `pnpm test` in `apps/extension`: the settings' defaults, storage,
  and channel (`src/shared/settings.test.ts`); Send Crash Reports taking its default and kind from
  `settingDefaults` (`src/error-reports/report-setting.test.ts`); and, in happy-dom on one fake
  Chrome (`src/test/fake-chrome.ts`, `src/test/extension.tsx`), Settings and the header with the
  test content script beside them, each behavior their product docs list.
- **In Chrome,** in the agent Chrome harness ([`extension.md`](extension.md), Checks): open
  Settings, turn a reading aid and a site off and on, and see the test page follow without a
  reload.
