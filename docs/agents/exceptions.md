# Exceptions to the rules

Every place a rule in [`code.md`](code.md) doesn't apply, and why. A rule is never switched off in
the code it flags, so there are two kinds of exception, and no third.

## Lists beside the checks

Each list is in the check's own code, each entry has its size or count and its reason, and the
check fails an entry that grew, asks for one to be lowered as the thing shrinks, and for it to go
once it isn't needed. An entry is never raised to make a check pass.

| List | Holds |
| --- | --- |
| `knownLargeFiles` in `tools/checks/src/sizes.ts` | Code files over 500 lines |
| `knownDuplicates` in `tools/checks/src/known-duplicates.ts` | Pairs of files that repeat a block |
| `knownLongDocs` in `tools/checks/src/doc-rules/budgets.ts` | Docs over their size budget when the check arrived |
| `allowedPauses` in `tools/checks/src/waits.ts` | Fixed pauses in each UI test file, each with what it proves does not happen |
| `AllowedFinding.list` in `apps/ios/UITests/AccessibilityAuditExceptions.swift` | Accessibility audit findings the UI tests let pass, each naming one element, its screens, devices, and text sizes, and why ([`ios-accessibility.md`](ios-accessibility.md)). An entry that matches nothing on a screen a test audited fails the test. `AllowedFinding.reportedOnly` holds the one audit reported without failing, contrast, with why |
| The file lists in `tools/checks/src/files.ts` | Files written by a tool, third-party files, and files whose bytes a checksum pins, each by name with its tool, source, or checksum. The comments check leaves them as they are |

The weekly maintenance report counts the first three ([`ci-agents.md`](ci-agents.md), Weekly
maintenance).

## Rules turned off in a tool's config

A linter's config file can't hold a reason, so each rule it turns off is here. Add a row, with
its reason, in the pull request that turns another off.

| Where | What is off | Why |
| --- | --- | --- |
| `apps/web/scripts/.shellcheckrc` | ShellCheck's SC2329, for the scripts in that folder | `smoke.sh` hands its checks to `expect` and `eventually` by name, which ShellCheck reads as functions nothing calls |
| `apps/web/biome.json`, for `src/components/ui/**` | `useSemanticElements`, `useKeyWithClickEvents`, and `useFocusableInteractive` | Those files are shadcn/ui's, kept as its CLI wrote them ([`web.md`](web.md)) |
| `apps/web/biome.json`, for `dictionary-breadcrumbs.tsx` | `noDangerouslySetInnerHtml` | The breadcrumbs' JSON-LD is the text of a `script` element, written through `jsonThatCannotCloseItsScript` |
| `tools/checks/biome.json`, for the checks' tests | `noTemplateCurlyInString` | The tests quote workflow expressions, which are written `${{ … }}` |
| `knip.json` | `apps/ios/**` isn't read, and `tsx` and Secretlint's preset aren't reported as unused | The app's copy of the core is a built file; `tsx` and the preset are loaded by name, by `node --import` and by Secretlint's config |
