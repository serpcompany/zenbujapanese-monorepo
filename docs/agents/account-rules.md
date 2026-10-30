# Account rules

`packages/account-rules` is the one definition of each rule a learner's account input is held
to. The account service applies the rules, the website checks with them before it sends
anything, and the app runs the same TypeScript in JavaScriptCore. Each rule has a case file of
inputs and outcomes in `packages/account-rules/cases/`, which the package's tests, the service's,
the website's, and the app's all replay, so a client that disagrees with the rule fails its own
tests.

Run every command below from `packages/account-rules`, after `pnpm install` at the repository root.

## The rules

| Rule | Module | Case file | What it holds |
| --- | --- | --- | --- |
| A profile name | `src/profile.ts` | `cases/name.json` | Unicode NFC, trimmed as JavaScript trims, runs of whitespace made one space, 1 to 100 code points, no control, invisible format, or surrogate character anywhere |
| A username | `src/profile.ts` | `cases/username.json` | NFKC, trimmed, lowercased, then 3 to 30 of `a`–`z`, digits, and `_`; a field left blank, as JavaScript trims, removes the username |
| A sign-in code | `src/sign-in-code.ts` | `cases/sign-in-code.json` | Six ASCII digits once trimmed |
| A list's name | `src/lists.ts` | `cases/list-name.json` | NFC, control characters made spaces, trimmed, 1 to 500 code points; the app cuts a longer one to fit, after trimming, and the service refuses one it's sent |
| A daily list's ID | `src/daily-lists.ts` | `cases/daily-list-id.json` | `00000000-da11-4000-8000-0000yyyymmdd` for a day that exists (`dailyListId`), and the day back from one in either case (`dailyListDay`); any other ID, an impossible day's too, is no daily list. The service leaves a daily list out of the 500-list cap while its day is from 2026-10-01 to the day after its own UTC date |
| A note's text | `src/notes.ts` | `cases/note-text.json` | Line breaks made `\n`, other control characters but tabs made spaces, NFC, trimmed, 1 to 10,000 code points, never cut |
| A watch's title, channel, and numbers | `src/watch.ts` | `cases/watch-fields.json` | Text cut to 200 code points with control characters made spaces, a blank one left out; seconds 0 to 10,000,000, comprehension 0 to 1 |
| A setting | `src/settings.ts` | `cases/settings.json` | Each setting the service syncs, its kind, and values it takes and refuses |
| Recent videos and searches at one time | none: SQL and the app's sort | `cases/recent-order.json` | Newest first; at the same time, the greater ID first, by code point, so the account prunes the one the device drops |

Counting is by code point everywhere: a field's own limit, such as HTML's `maxlength`, counts
UTF-16 units and cut a pasted name of emoji to half, so the website sets none and checks with the
rule. "Trimmed as JavaScript trims" means Unicode's White_Space but U+0085, plus U+FEFF, which
the shared username cases have trimmed since they started. A byte order mark inside a name is an
invisible format character, refused like U+200B: JavaScript's `\s` lists U+FEFF, so a name rule
built on it had made one a space.

`src/text.ts` holds what the rules share: the plain-text form the service keeps (lone surrogates
made U+FFFD, control characters made spaces, NFC, trimmed), cutting by code point, and the
check for invisible characters. `src/test/cases.ts` loads the case files for any package's tests,
with `textOf` for a case written as a repeated run (`{ "text": "x", "times": 501 }`).

## A client's copy

Beside the rules, the package holds what a client that keeps no copy of the account does with them:
`src/account-copy.ts` reads a kind, sends a change at the version it read, reads the kind again,
keeps a note's text through a conflict as the app does, and sends a search again over a removal it
never read, which came before it; `src/account-views.ts` orders what it read as the apps show it
(lists, a list's words, recent videos and searches, and a word Known only when the account says so,
as an app that shows only Known reads it, so a Learning word isn't). The website runs both
([`account-client-rules.md`](account-client-rules.md#keeping-no-copy)); a transport the caller hands
in does the requests, so nothing here fetches. `src/account-copy.test.ts` covers them on their own,
and the service's `website-copy.test.ts` against the service.

## Who replays what

- **The service** takes its profile, list, note, watch, and setting rules from the package
  (`apps/account-api/src/domain`), and Better Auth's code length from `signInCode`. Its tests
  replay the name and username cases (`apps/account-api/src/domain/profile.test.ts`), the daily
  list IDs against the list cap (`apps/account-api/src/http/daily-lists.test.ts`), and the
  order of tied videos (`apps/account-api/src/db/postgres.test.ts`, on PGlite and on a real
  Postgres in CI). The tie test fails under a linguistic collation such as `en_US.UTF-8`, the
  official `postgres` image's, unless the prune sorts IDs `collate "C"` (`inCodePointOrder`,
  `apps/account-api/src/db/kept-rows.ts`).
- **The website** checks the profile form's name and username with the rules before sending,
  and shows the rule's sentence when one fails, the same words the service's refusal carries; its
  code field's pattern is `signInCode.typedPattern`. `account-rules.interaction.test.tsx`
  replays the name, username, and code cases through the forms.
- **The extension** takes only the sign-in code rule: its code field's pattern is
  `signInCode.typedPattern`, and it sends what `signInCodeOf` makes of the typed code, or nothing.
  `apps/extension/src/account/account-rules.interaction.test.tsx` replays the code cases through
  the account component's code field, against a stand-in service.
- **The app** asks the rules' own JavaScriptCore bundle
  (`apps/ios/Modules/Sources/SearchExperience/Resources/AccountRules/account-rules.js`) through
  `AccountRules` (`AccountRules.swift`): Profile's name and username, the code's Sign In button,
  a list's name, a note compared as the account keeps it and whether it fits, and a watch's
  fields, a whole batch of watches in one call (`SavedItemChange.forTheAccount`).
  `SharedAccountRulesTests`, `SharedSettingsRulesTests`, `AccountRulesTests`, and
  `UserProfileTests` replay the cases; the order of tied videos and searches is the app's own sort,
  which `SharedAccountRulesTests.recentOrder()` holds to the case file.

## The app's bundle

`src/embedded/javascriptcore.ts` puts `zenbuAccountRules` on the global object, with `answer` and
`answerJSON`, as the dictionary core's bundle does, and `src/embedded/answers.ts` names the rules
the app may ask for. `pnpm bundle:javascriptcore` writes the bundle with the dictionary core's
bundler (`packages/dictionary-core/scripts/javascriptcore-bundle.mjs`, `bundleFor`), and
`src/embedded/bundle.test.ts` fails until the checked-in bundle matches the source. The app keeps
the bundle in an engine of its own, beside the dictionary's three ([`ios.md`](ios.md), The
dictionary core in the app), and makes it in the background as its account starts
(`AccountRules.prepareSoon()`), so a check doesn't wait behind the presentation engine's lock or
its start. The bundle is about 5 KB: on this repository's virtual Mac, a new engine answered its
first check in under a millisecond at the median, against about 7 ms for the presentation engine.
Warm, a call costs about half a microsecond before any rule's own work, so a batch, such as a
first upload's watches, goes in one call.

## Changing a rule

Change the module and its case file together, then run `pnpm bundle:javascriptcore` and commit
the bundle. A rule the service applies changes what it stores, so its product docs and the
service's API reference change with it ([`account-api.md`](account-api.md), Routes). The app and
the website each fail their tests until they agree with the cases.

## Check it

```sh
pnpm check
```

It runs Biome, the typecheck, and the tests: each case file through its rule, the app's answers
through `answer`, and the bundle against the source. `src/` imports no runtime or framework
(Biome and `pnpm verify`), since the rules run in Node, in a browser, and in JavaScriptCore; only
`src/test/` reads files.
