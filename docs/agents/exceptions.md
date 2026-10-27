# Exceptions to the rules

Every place a rule in [`code.md`](code.md) doesn't apply, and why. A rule is never switched off in
the code it flags, so there are two kinds of exception, and no third.

## Lists beside the checks

Each list is in [`verify.json`](../../verify.json), each entry has its size or count and its
reason, and the check fails an entry that grew, asks for one to be lowered as the thing shrinks,
and for it to go once it isn't needed. An entry is never raised to make a check pass.

| List | Holds |
| --- | --- |
| `exceptions.knownLargeFiles` in `verify.json` | Code files over 500 lines |
| `exceptions.knownDuplicates` in `verify.json` | Pairs of files that repeat a block |
| `exceptions.knownLongDocs` in `verify.json` | Docs over their size budget when the check arrived |
| `exceptions.allowedPauses` in `verify.json` | Fixed pauses in each UI test file, each with what it proves does not happen |
| `docs.github.exempt` in `verify.json` | Docs whose `gh` commands aren't an agent's, so they needn't link how an agent runs `gh` ([`code.md`](code.md), Docs), each with why |
| `AllowedFinding.list` in `apps/ios/UITests/Accessibility/AccessibilityAuditExceptions.swift` | Accessibility audit findings the UI tests let pass, each naming one element, its screens, devices, and text sizes, and why ([`ios-accessibility.md`](ios-accessibility.md)). An entry that matches nothing is listed in the test's report. `AllowedFinding.reportedOnly` holds the audits reported without failing, and `AllowedFinding.notRun` the audits a device skips, everywhere or on the screens it names, each with why |
| `files` in `verify.json` | Files written by a tool, third-party files, and files whose bytes a checksum pins, each by glob with its tool, source, or checksum. The comments check leaves them as they are, and `@serpcompany/verify` adds its own defaults for a lockfile, `cloudflare-env.d.ts`, and Xcode's and Swift Package Manager's files, which this list names too |

The weekly maintenance report counts the first three ([`ci-agents.md`](ci-agents.md), Weekly
maintenance). `@serpcompany/verify` can also record a check's findings per file as a baseline
(`exceptions.baseline`, written by `serp-verify baseline`); this repository has none, and
`tools/checks/src/verify-package.test.ts` refuses a list this doc doesn't name.

## Rules turned off in a tool's config

A linter's config file can't hold a reason, so each rule it turns off is here. Add a row, with
its reason, in the pull request that turns another off.

| Where | What is off | Why |
| --- | --- | --- |
| `apps/web/scripts/.shellcheckrc` | ShellCheck's SC2329, for the scripts in that folder | `smoke.sh` hands its checks to `expect` and `eventually` by name, which ShellCheck reads as functions nothing calls |
| `packages/ui/biome.json`, for `src/components/**` | `useSemanticElements`, `useKeyWithClickEvents`, and `useFocusableInteractive` | Those files are shadcn/ui's, kept as its CLI wrote them but for the portal container three of them pass ([`ui.md`](ui.md)) |
| `apps/web/biome.json`, for `dictionary-breadcrumbs.tsx` | `noDangerouslySetInnerHtml` | The breadcrumbs' JSON-LD is the text of a `script` element, written through `jsonThatCannotCloseItsScript` |
| `tools/checks/biome.json`, for the checks' tests | `noTemplateCurlyInString` | The tests quote workflow expressions, which are written `${{ … }}` |
| `knip.json` | `apps/ios/**` isn't read, `tsx` isn't reported as unused in `packages/node-service`, and `lefthook` isn't reported as unused at the root | The app's copy of the core is a built file; `tsx` is loaded by name, by `node --import`; knip counts `lefthook` as used only under CI's setting or with git hooks installed, and the weekly report runs on a runner with neither |
