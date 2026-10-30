# The extension's error reports

How the browser extension ([`extension.md`](extension.md)) reports its errors: its Sentry
project, what each part sends and scrubs, the setting that stops it, the source maps, and the
check that one arrives.

Every part reports its errors to Sentry's `zenbujapanese-extension` in `serpcompany`, the
extension's own project, set up as the app's is ([`ios-crash-reports.md`](ios-crash-reports.md)),
with one difference below. The YouTube content script reports only the errors thrown while the
player caption draws; the follower and the watch-page code report none yet (#1075). There are no usage analytics. The decision is ADR
0018's amendment for the extension ([`0018`](../adr/0018-report-the-apps-crashes-and-freezes-to-sentry.md)).

- **Owner steps for the project.** Create it, set its DSN as `sentryDsn`, and in **Project
  Settings › Inbound Filters** turn off **Filter out errors known to be caused by browser
  extensions**, leaving the other filters on. A new project has that filter on, and it drops
  every event whose top frame is a `chrome-extension://` URL, which is every event this
  extension sends, so none would arrive and nothing would say why. Then note the project's
  retention, which is set in Sentry, in this section.
- **Which builds send.** The DSN is `sentryDsn` in `build/error-reports.ts`; it only lets a client
  send events, so it isn't a secret. The build puts it, the environment, and the release
  (`zenbujapanese-extension@<manifest version>`) into the code as `import.meta.env.ZENBU_SENTRY_*`.
  The environment follows the app's: `qa`, unless `ZENBU_SENTRY_ENVIRONMENT=production` is set for
  the build, which #986's production package does; its staging package stays `qa`. Tests define
  none of them, so nothing in Vitest reaches Sentry. Until the project exists, `sentryDsn` is
  empty and no build sends anything.
- **Only the service worker talks to Sentry.** It calls `Sentry.init` with global handlers
  (`startSendingErrorReports`), and also sends what the other parts hand it
  (`receiveErrorReport`). The pages (in `mountPage`), the offscreen document, and the dictionary
  worker call `Sentry.init` with global handlers too (`startErrorReports(part, forward)`), but
  their transport sends each envelope to the service worker as an `{ target: 'service-worker',
  errorReport }` message; the worker, which has no `chrome.runtime`, posts it to the offscreen
  document, which passes it on. Each event is tagged `part`: `page`, `service-worker`,
  `offscreen`, or `worker`.
- **Content scripts** (`contentScriptErrorReports(forward)`) run beside the page's own code, so
  they never call `Sentry.init` and add no global handler, as Sentry's
  [guide for browser extensions](https://docs.sentry.io/platforms/javascript/best-practices/browser-extensions/)
  says: a `BrowserClient` with its own `Scope` builds an event only from what the content script
  hands it, such as an error React throws while drawing (`mountInShadowRoot`'s `report`, which
  also logs it to the console and never passes it to the page). Its envelope goes to the service
  worker as a message, so the content script makes no request: none shows in the page's Network
  panel, none meets the page's CSP, and Sentry never sees the page's site as an `Origin`.
- **Send Crash Reports.** As in the app ([`crash-reports.md`](../../apps/ios/docs/product/crash-reports.md)),
  reports are on until the learner turns them off. The setting is `crashReports.send` in
  `chrome.storage.local`, a boolean; missing means on (`src/error-reports/report-setting.ts`).
  Since every report goes through the service worker, it is read there, before anything is sent:
  a report made before the read waits for it, and goes only if the setting is on. The service
  worker follows `chrome.storage.onChanged`, so turning it off stops the next report at once and
  turning it on starts them again, with no reload; a setting it can't read counts as off. The
  switch is on the Settings page; the key's default and how a stored value reads are
  `settings.ts`'s. Sentry keeps an event for the project's retention, which is set in Sentry (see the
  owner steps).
- **Handled failures.** When the service worker answers a dictionary or translation request with
  a failure, it reports it once with `reportFailure(code)`, a message holding only the code and
  grouped by it: `offscreen-document` (the document couldn't be opened), `offscreen-message` (it
  couldn't be reached), `dictionary-answer` (it answered with a failure, such as a worker that
  failed or didn't answer), or `translation-answer` (the Translator failed or didn't answer in
  time). It reports `side-panel-behavior` when Chrome refuses, as the service worker starts, to
  open the side panel from the toolbar icon (`src/service-worker/side-panel.test.ts`), and
  `page-script` when registering or injecting the page script fails
  (`src/service-worker/page-scripts.test.ts`). The account reports `account-storage` when Chrome
  refuses, as the service worker starts, to close `chrome.storage.local` to content scripts, and
  `account-answer` when an account ask fails rather than being refused, such as storage that
  can't be read or written (`src/service-worker/account/channel.ts`). Neither holds a session
  token, an access token, an emailed code, or an email
  (`src/service-worker/account/failure-reports.test.ts`). A translator that isn't available is an answer, not
  a failure. Never the failure's text,
  the request, the selected text, or the translation. A code that fails again and again is
  reported once per service-worker life: `dedupeIntegration` drops an event that repeats the one
  before it.
- **What an event holds.** Only the integrations that find a fault run: event filters, function
  names, linked errors, dedupe, the `User-Agent` header, and, outside content scripts, the global
  handlers. Breadcrumbs, sessions, client reports, cookies, query strings, frame variables, and
  context lines are off, and Sentry is asked not to infer an IP address (`userInfo: false`).
  `scrubEvent` (`src/error-reports/scrub.ts`), the `beforeSend`, then drops breadcrumbs, extras,
  the user, the server name, the transaction, and the request's URL, keeps only the `part` tag and
  the `browser`, `os`, `runtime`, `device`, and `trace` contexts, and turns any frame or debug
  image that isn't the extension's own (`chrome-extension://`) into `<page>`. In every message
  and exception value it removes quoted text (`"…"`, `“…”`, `「…」`, `『…』`), URLs, and kana
  and kanji, including kanji outside the BMP such as 𩸽. It can't tell unquoted romaji or English
  from the code's own words, so it leaves them; that's why the code builds a message from codes
  and never puts a learner's text in one.
- **Source maps.** Both builds write hidden source maps (no `sourceMappingURL`) beside their
  scripts. `pnpm upload-source-maps [folder]` (`build/upload-source-maps.ts`, `dist` by default)
  installs a pinned `@sentry/cli` and adds debug IDs to the scripts and maps
  (`sourcemaps inject`), both without the token, then uploads the maps under the manifest's
  release with `SENTRY_AUTH_TOKEN`, and then always deletes every `.map` from the folder, so the
  store zip, made from the folder afterwards, holds none. The token comes only from
  `SENTRY_AUTH_TOKEN`, never the login keychain (the app's token there got a 400), and the script
  never prints it. No maps, no token (then no upload is tried), or a step that fails or stalls is
  a warning and exits 0, and so is a `manifest.json` that is missing or has no version: the maps
  are still deleted. Without a token the scripts still get their debug IDs, so the package can
  ship; build the same commit again and upload its maps later (the debug IDs come from the files'
  contents, so they match). The `Extension packages` workflow runs it only on the Chrome Web Store
  package, and only on `main` ([`ci-deploys.md`](ci-deploys.md)): the staging package's maps are
  deleted without an upload, so its scripts get no debug IDs and its events aren't symbolicated.
- **Checking one arrives.** In the agent Chrome harness, load a build with the DSN, then throw
  from each context: `setTimeout(() => { throw new Error('Zenbu test error: <part>') })` evaluated
  in a page, the service worker, the offscreen document, and the dictionary worker, and Test
  error on the test surface for the content script. Find each in `zenbujapanese-extension`,
  environment `qa`. Throwing the same way in a test page's own context, with the content script
  running, must send nothing (`--net sentry`), and so must every part once `crashReports.send` is
  `false`.
