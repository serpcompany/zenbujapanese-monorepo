# Existing Japanese text technology for issue #191

Research supporting [#191](https://github.com/serpcompany/zenbujapanese-monorepo/issues/191) on the shared native-refactor branch at `f9cb83fa61ba3396f4f75ce8de77d330f2e77c78`. Consulted 2026-09-01.

## Decision

Do **not** choose options A-D from the current #191 gate yet, and do not build a new text engine. Authorize one bounded prototype of a selectable, noneditable `UITextView` containing a single `NSAttributedString` whose ranges carry both Core Text ruby annotations and native link attributes.

This is the smallest integration of proven platform primitives found in the covered search:

- Core Text owns ruby representation and typesetting through `CTRubyAnnotation`, `CTTypesetter`, and `CTLine`; Apple documents the ruby object and attributed-string key directly. [Apple: `CTRubyAnnotation`](https://developer.apple.com/documentation/coretext/ctrubyannotation), [Apple: `kCTRubyAnnotationAttributeName`](https://developer.apple.com/documentation/coretext/kctrubyannotationattributename), [Apple: `CTTypesetter`](https://developer.apple.com/documentation/coretext/cttypesetter)
- `UITextView` owns multiline attributed text and native text-item interaction; Apple states that links are interactive when the view is selectable and noneditable. [Apple: `UITextView`](https://developer.apple.com/documentation/uikit/uitextview), [Apple: text-view URL interaction](https://developer.apple.com/documentation/uikit/uitextviewdelegate/textview%28_%3Ashouldinteractwith%3Ain%3A%29-98tho), [Apple: primary action for text items](https://developer.apple.com/documentation/uikit/uitextviewdelegate/textview(_:primaryactionfor:defaultaction:))
- Zenbu continues to own `DictionaryEntry`, `ExampleSentence`, `JapaneseTextToken`, navigation, labels, and source provenance behind its existing capability boundaries. [ADR 0001](../adr/0001-language-capability-boundaries.md), [current models and analyzer](../../apps/ios/Modules/Sources/SearchExperience/JapaneseTextAnalysisClient.swift), [current linked-token view](../../apps/ios/Modules/Sources/SearchExperience/LinkedJapaneseText.swift)

Apple does **not** document that `UITextView` simultaneously honors `kCTRubyAnnotationAttributeName`, measures wrapped ruby correctly, exposes each linked range with Zenbu's rich label, and supplies non-overlapping usable targets. That combined behavior is the prototype question, not an established fact. The current #191 native `Text(AttributedString)` probe is therefore still valid negative evidence, but it did not test the more capable UIKit/TextKit surface. [Apple: SwiftUI `Text(AttributedString)` supported-attribute boundary](https://developer.apple.com/documentation/swiftui/text/init(_:)), [#191 probe evidence](https://github.com/serpcompany/zenbujapanese-monorepo/issues/191#issuecomment-5488626177)

## Direct answer to the blocker

**No inspected component proves all required #191 seams together:** compact wrapping Japanese, retained ruby, per-token activation to canonical Word Detail, rich per-token accessibility labels, and non-overlapping usable targets at Dynamic Type sizes.

This is a bounded search conclusion, not a claim that no implementation exists anywhere. Coverage included Apple's current text APIs; GitHub repository searches for Swift/iOS Japanese readers, furigana/ruby views, and Japanese tokenizers; exact source, tests, licenses, releases, and CI for the candidates below; and the named MeCab, Sudachi, Lindera, Vibrato, EDRDG, KanjiVG, Tatoeba, Jitendex, and Yomitan families. Search terms and inspected shapes are recorded below.

## Contract already owned by Zenbu

Issue #218 explicitly retains `JapaneseRubyText` and linked Japanese tokens as purpose-specific UI while moving ordinary screen structure to native SwiftUI. [#218 decision map](https://github.com/serpcompany/zenbujapanese-monorepo/issues/218)

The pushed implementation at the research base has four relevant app-owned seams:

1. `ExampleSentence` contains an opaque app-owned ID and Japanese/English text; retrieval remains governed by `ExampleSentenceRetrievalPolicy/v1`. [model](../../apps/ios/Modules/Sources/SearchExperience/ExampleSentenceClient.swift), [ADR 0002](../adr/0002-example-sentence-retrieval-contract.md)
2. `JapaneseTextAnalysisClient` supplies `[JapaneseTextToken]`; the current live implementation performs a custom longest dictionary match and narrow hand-written deinflection. Replacing that analysis is allowed behind the capability boundary, but provider tokens must not become the product contract. [analyzer](../../apps/ios/Modules/Sources/SearchExperience/JapaneseTextAnalysisClient.swift), [ADR 0001](../adr/0001-language-capability-boundaries.md)
3. A linked token carries an app-owned `DictionaryEntry`, and activation opens that entry rather than a provider row. Dictionary identity and ranking are app-owned under ADR 0003. [linked view](../../apps/ios/Modules/Sources/SearchExperience/LinkedJapaneseText.swift), [dictionary model](../../apps/ios/Modules/Sources/SearchExperience/DictionaryEntry.swift), [ADR 0003](../adr/0003-dictionary-best-match-contract.md)
4. `JapaneseRubyText` currently derives word-internal base/reading pieces with a local alignment algorithm and renders them as nested SwiftUI stacks. It is not a compact paragraph renderer. [ruby view](../../apps/ios/Modules/Sources/SearchExperience/JapaneseRubyText.swift), [alignment implementation](../../apps/ios/Modules/Sources/SearchExperience/JapaneseTextAnalysisClient.swift)

The data families named in the research request already feed separate app-owned models: JMdict feeds `DictionaryEntry`, KANJIDIC2 plus KRADFILE/RADKFILE feed `KanjiReferenceEntry`, KanjiVG feeds stroke geometry, and Tatoeba feeds `ExampleSentence`. None is a renderer or an interaction model. [dictionary importer](../../apps/ios/Tools/import_jmdict.py), [kanji importer](../../apps/ios/Tools/import_kanjidic.py), [radical importer](../../apps/ios/Tools/import_radicals.py), [KanjiVG importer](../../apps/ios/Tools/import_kanjivg.py), [Tatoeba adapter](../../apps/ios/Tools/tatoeba_adapter.py)

## Shapes scouted before candidate search

Six shapes were fixed before repository search so a familiar library name would not decide the architecture:

1. one native SwiftUI `Text(AttributedString)` with linked ranges;
2. one `UITextView`/TextKit attributed paragraph with ruby and links;
3. a Core Text typesetter with app-owned interaction/accessibility overlays;
4. an exact renderer from a released open-source Japanese iOS reader;
5. a focused Swift ruby/furigana component;
6. an established morphological analyzer that produces ranges/readings behind `JapaneseTextAnalysisClient`, independently of rendering.

Repository searches covered `furigana language:Swift`, `Japanese reader language:Swift iOS`, `Japanese tokenizer language:Swift`, `lindera swift`, `sudachi swift`, and `vibrato swift Japanese tokenizer`. Exact candidates were then inspected rather than accepted from README claims. [GitHub repository search](https://docs.github.com/en/search-github/searching-on-github/searching-for-repositories)

## Apple text-stack findings

### SwiftUI attributed text: adapt only as negative/control evidence

SwiftUI `Text` renders the Foundation `link` attribute as a clickable link and permits custom handling through `OpenURLAction`, but Apple says it ignores other Foundation-defined attributes outside the documented subset. Apple exposes no SwiftUI ruby attribute in that supported subset. [Apple: `Text.init(_:)`](https://developer.apple.com/documentation/swiftui/text/init(_:))

That matches the retained #191 probe: compact linked ranges passed the focused hit-region audit and navigated, while visible ruby and the detailed range label disappeared. [#191 evidence](https://github.com/serpcompany/zenbujapanese-monorepo/issues/191#issuecomment-5488626177)

Verdict: **reject as the #191 renderer while ruby and rich labels remain required; retain as a control case in the prototype.**

### `TextRenderer`: defer

`TextRenderer` replaces drawing and can measure a `TextProxy`, but Apple's public protocol surface documents drawing and sizing, not substring activation, hit testing, or construction of per-range accessibility elements. [Apple: `TextRenderer`](https://developer.apple.com/documentation/swiftui/textrenderer)

Verdict: **defer**. Using it for ruby would still require Zenbu to invent the missing per-range interaction and accessibility model.

### `UITextView`/TextKit: prototype

`UITextView` accepts rich attributed text, exposes TextKit layout objects, and has native text-item actions. Apple documents that URL links are interactive only when the view is selectable and noneditable. [Apple: `UITextView`](https://developer.apple.com/documentation/uikit/uitextview), [Apple: URL interaction](https://developer.apple.com/documentation/uikit/uitextviewdelegate/textview%28_%3Ashouldinteractwith%3Ain%3A%29-98tho)

TextKit exposes wrapped-range geometry through `NSLayoutManager.enumerateEnclosingRects` and `NSTextLayoutManager.enumerateTextSegments`, while UIKit permits container-relative accessibility frames. These are fallback measurement primitives if the native link accessibility output needs inspection; they do not themselves prove a compliant result. [Apple: TextKit 1 enclosing rects](https://developer.apple.com/documentation/uikit/nslayoutmanager/enumerateenclosingrects(forglyphrange:withinselectedglyphrange:in:using:)), [Apple: TextKit 2 text segments](https://developer.apple.com/documentation/uikit/nstextlayoutmanager/enumeratetextsegments(in:type:options:using:)), [Apple: `accessibilityFrameInContainerSpace`](https://developer.apple.com/documentation/uikit/uiaccessibilityelement/accessibilityframeincontainerspace)

Verdict: **prototype first** because it is the only covered platform shape that may combine system link semantics with Core Text ruby without replacing text layout.

### Direct Core Text view: proven typography primitive, deferred interaction shell

Core Text officially defines ruby annotations, attributed-string ruby keys, line breaking, line drawing, run geometry, and string-position lookup. [Apple: `CTRubyAnnotation`](https://developer.apple.com/documentation/coretext/ctrubyannotation), [Apple: `CTTypesetterSuggestLineBreak`](https://developer.apple.com/documentation/coretext/cttypesettersuggestlinebreak(_:_:_:)), [Apple: `CTLineDraw`](https://developer.apple.com/documentation/coretext/ctlinedraw(_:_:)), [Apple: `CTLineGetStringIndexForPosition`](https://developer.apple.com/documentation/coretext/ctlinegetstringindexforposition(_:_:))

OpenKoto's current iOS source is useful implementation evidence: its `RubyTypesetter` applies `kCTRubyAnnotationAttributeName`, uses `CTTypesetterSuggestLineBreak`, measures each `CTLine`, and draws the retained layout; its tests cover wrapped height, line count, empty text, and snapshot behavior. [typesetter at inspected commit](https://github.com/hikariming/openkoto/blob/9b99799ab9d3c56ebe1ac0a8f99b5192351f5fd4/openkoto-ios/Packages/OpenKotoKit/Sources/OKDesignSystem/Components/RubyTypesetter.swift), [typesetter tests](https://github.com/hikariming/openkoto/blob/9b99799ab9d3c56ebe1ac0a8f99b5192351f5fd4/openkoto-ios/Packages/OpenKotoKit/Tests/OKDesignSystemTests/RubyTypesetterTests.swift)

The same implementation deliberately sets its ruby view to `isUserInteractionEnabled = false` and `isAccessibilityElement = false`; an outer chip owns interaction and one label. It therefore proves wrapped ruby measurement, not inline links or per-token accessibility. [OpenKoto `RubyLabel`](https://github.com/hikariming/openkoto/blob/9b99799ab9d3c56ebe1ac0a8f99b5192351f5fd4/openkoto-ios/Packages/OpenKotoKit/Sources/OKDesignSystem/Components/RubyLabel.swift)

Verdict: **adapt the proven Core Text typography approach only if the TextKit prototype fails**. At that point touch-to-index mapping and a `UIAccessibilityElement` tree become a separately authorized interaction shell, because OpenKoto does not supply those seams.

## Released/open-source reader evidence

### OpenKoto: adapt concepts, not a drop-in dependency

OpenKoto's project states that its native iOS app is released on the App Store. The inspected tree has a native iOS package, a Core Text ruby typesetter, ruby-specific tests, and an iOS version commit. [project README at inspected commit](https://github.com/hikariming/openkoto/blob/9b99799ab9d3c56ebe1ac0a8f99b5192351f5fd4/README.md), [iOS package manifest](https://github.com/hikariming/openkoto/blob/9b99799ab9d3c56ebe1ac0a8f99b5192351f5fd4/openkoto-ios/Packages/OpenKotoKit/Package.swift), [inspected commit](https://github.com/hikariming/openkoto/commit/9b99799ab9d3c56ebe1ac0a8f99b5192351f5fd4)

Its ruby view explicitly delegates all interaction and accessibility to an outer control, and the native reader wraps each complete sentence in a `SentenceChip` button rather than exposing inline token links. It therefore does not satisfy #191's inline token contract. [ruby view](https://github.com/hikariming/openkoto/blob/9b99799ab9d3c56ebe1ac0a8f99b5192351f5fd4/openkoto-ios/Packages/OpenKotoKit/Sources/OKDesignSystem/Components/RubyLabel.swift), [native chapter interaction](https://github.com/hikariming/openkoto/blob/9b99799ab9d3c56ebe1ac0a8f99b5192351f5fd4/openkoto-ios/Packages/OpenKotoKit/Sources/OKFeatures/Books/NativeChapterView.swift)

Its repository license describes Apache 2.0 plus additional commercial, branding, and relicensing conditions, so copying code requires independent license review; the GitHub API consequently reports no standard SPDX license. [OpenKoto license](https://github.com/hikariming/openkoto/blob/9b99799ab9d3c56ebe1ac0a8f99b5192351f5fd4/LICENSE)

Verdict: **adapt the architecture evidence, not source code, for the prototype.**

### Hoshi Reader: reject for integration, retain product evidence

Hoshi Reader is a released iOS Swift reader, but its reading and lookup implementation is WebKit/JavaScript-based rather than a SwiftUI/TextKit inline component. [App Store listing](https://apps.apple.com/app/hoshi-reader/id6758244332), [project README at inspected commit](https://github.com/Manhhao/Hoshi-Reader/blob/784a94dd06b163e4e40d01e7d60452962bf7b90c/README.md), [reader web view](https://github.com/Manhhao/Hoshi-Reader/blob/784a94dd06b163e4e40d01e7d60452962bf7b90c/Features/Reader/ReaderWebView/ReaderWebView.swift), [lookup engine](https://github.com/Manhhao/Hoshi-Reader/blob/784a94dd06b163e4e40d01e7d60452962bf7b90c/Core/LookupEngine.swift)

The repository is GPL-3.0, which is a materially different distribution obligation from adopting a platform primitive or permissive package. [Hoshi license](https://github.com/Manhhao/Hoshi-Reader/blob/784a94dd06b163e4e40d01e7d60452962bf7b90c/LICENSE)

Verdict: **reject as an integration candidate**; it does not prove the native #191 seams and presents copyleft risk.

### FuriganaTextView: reject

FuriganaTextView is an MIT UIKit component that subclasses TextKit 1 layout behavior with a custom furigana attribute. Its last tagged release is `0.4.1` from 2016, and the inspected source has no Swift Package manifest or test suite. [source](https://github.com/lingochamp/FuriganaTextView/tree/03dc734c384cf50b1368607d3ab3c593ff8caedc/src), [releases](https://github.com/lingochamp/FuriganaTextView/releases), [license](https://github.com/lingochamp/FuriganaTextView/blob/03dc734c384cf50b1368607d3ab3c593ff8caedc/LICENSE)

Its custom layout manager addresses furigana glyph placement and word breaking, but supplies no inline-link routing or per-token accessibility implementation. [layout manager](https://github.com/lingochamp/FuriganaTextView/blob/03dc734c384cf50b1368607d3ab3c593ff8caedc/src/FuriganaLayoutManager.swift)

Verdict: **reject** because the implementation is stale and incomplete for #191.

### FuriganaKit: reject

FuriganaKit is a new MIT Swift 6.2 package with parser/splitter unit tests, but its renderer composes fixed SwiftUI stacks and does not implement inline links or accessibility. [manifest](https://github.com/Toasha/FuriganaKit/blob/336360ddafc002cae26d9b9a5ad02a45b2027886/Package.swift), [renderer sources](https://github.com/Toasha/FuriganaKit/tree/336360ddafc002cae26d9b9a5ad02a45b2027886/Sources/FuriganaKit/Views), [tests](https://github.com/Toasha/FuriganaKit/tree/336360ddafc002cae26d9b9a5ad02a45b2027886/Tests), [license](https://github.com/Toasha/FuriganaKit/blob/336360ddafc002cae26d9b9a5ad02a45b2027886/LICENSE)

An Xcode 26 local scout run produced 13 passing tests and one reading-conversion failure (`ゲーム` versus expected `げーむ`), so the inspected revision is not a green dependency candidate.

Verdict: **reject** for #191.

### RubyAttribute/JapaneseAttributesKit: reject

These packages bridge ruby metadata into attributed strings but do not provide rendering, wrapping, links, hit regions, or accessibility. [RubyAttribute source](https://github.com/ApolloZhu/RubyAttribute/blob/144553676f66a3cd2847f8f7470f419ec69ea3bd/Sources/RubyAttribute/CTRubyAnnotation%2BAttributedString.swift), [JapaneseAttributesKit source](https://github.com/swiftty/JapaneseAttributesKit/blob/002692ff96eafa020ecbf18b59af2d214132f34b/Sources/JapaneseAttributesKit/Attribute%2BRuby.swift)

Both inspected projects stopped changing in 2022; local Xcode 26 scout builds failed because RubyAttribute collides with Apple's current Core Text attributed-string types and JapaneseAttributesKit references an unavailable `verticalGlyphForm` scope member. [RubyAttribute history](https://github.com/ApolloZhu/RubyAttribute/commits/144553676f66a3cd2847f8f7470f419ec69ea3bd), [JapaneseAttributesKit history](https://github.com/swiftty/JapaneseAttributesKit/commits/002692ff96eafa020ecbf18b59af2d214132f34b)

Verdict: **reject**.

## Japanese analysis and reading candidates

Rendering and Japanese Text Analysis must remain separate decisions. No analyzer below solves wrapped ruby, link hit testing, or accessibility.

### Sudachi Swift binding: best future analyzer prototype, defer from #191

The inspected `sudachi-swift` package is a community Swift/UniFFI binding to `sudachi.rs`. It exposes source ranges, surface, dictionary form, normalized form, reading, POS, multiple split modes, and explicit dictionary injection; it does not bundle a dictionary. [manifest](https://github.com/iasnezhkov/sudachi-swift/blob/d816157863d76841ede10c4c0521e759b4349e65/Package.swift), [API and dictionary guidance](https://github.com/iasnezhkov/sudachi-swift/blob/d816157863d76841ede10c4c0521e759b4349e65/README.md), [tests](https://github.com/iasnezhkov/sudachi-swift/tree/d816157863d76841ede10c4c0521e759b4349e65/swift/Sudachi/Tests/SudachiTests)

Its binding has two releases, began in 2026, and its CI pins `sudachi.rs` and a dated SudachiDict while running Rust/Swift coverage gates. Those are strong engineering signals but a short production history. [releases](https://github.com/iasnezhkov/sudachi-swift/releases), [CI](https://github.com/iasnezhkov/sudachi-swift/blob/d816157863d76841ede10c4c0521e759b4349e65/.github/workflows/ci.yml), [upstream pin](https://github.com/iasnezhkov/sudachi-swift/blob/d816157863d76841ede10c4c0521e759b4349e65/third_party/sudachi.rs.pin)

SudachiDict offers small/core/full editions; the binding documents approximate on-disk sizes of 40/207/700 MB and preserves a replaceable external dictionary URL. SudachiDict is Apache-2.0 but includes third-party UniDic/NEologd notices that must accompany redistribution. [binding dictionary guide](https://github.com/iasnezhkov/sudachi-swift/blob/d816157863d76841ede10c4c0521e759b4349e65/README.md#the-dictionary), [official SudachiDict](https://github.com/WorksApplications/SudachiDict), [binding notice](https://github.com/iasnezhkov/sudachi-swift/blob/d816157863d76841ede10c4c0521e759b4349e65/NOTICE)

Verdict: **defer to a separate `JapaneseTextAnalysisClient` benchmark** against representative Zenbu sentences, app size, cold/warm latency, dictionary update procedure, and app-owned `DictionaryEntry` mapping. Do not add it to solve layout.

### MeCab-Swift: technically viable analyzer, reject bundled default dictionary

MeCab-Swift exposes tokenization and furigana annotations, accepts a `DictionaryProviding` implementation, and packages a MeCab C/C++ target. It is an analyzer/range generator, not a renderer. [tokenizer](https://github.com/shinjukunian/Mecab-Swift/blob/1f096492e37fc05fc2e7304091f54889974c5368/Sources/Mecab-Swift/Tokenizer.swift), [furigana annotation](https://github.com/shinjukunian/Mecab-Swift/blob/1f096492e37fc05fc2e7304091f54889974c5368/Sources/StringTools/FuriganaAnnotation.swift), [manifest](https://github.com/shinjukunian/Mecab-Swift/blob/1f096492e37fc05fc2e7304091f54889974c5368/Package.swift)

The package README explicitly calls its bundled IPADic old and describes supplying another compatible dictionary. The canonical MeCab documentation identifies the IPADic line as 2.7.0, and independently published package records identify the common snapshot as `2.7.0-20070801`. [MeCab-Swift README](https://github.com/shinjukunian/Mecab-Swift/blob/1f096492e37fc05fc2e7304091f54889974c5368/README.md), [official MeCab install documentation](https://github.com/taku910/mecab/blob/master/index.html), [versioned IPADic notice](https://github.com/atilika/kuromoji/blob/master/kuromoji-ipadic-neologd/NOTICE.md)

The wrapper is MIT, while its MeCab target and dictionary carry their own notices. A local Xcode 26 scout run passed 21 tests with legacy C++ deprecation warnings; the repository has no GitHub releases. [wrapper license](https://github.com/shinjukunian/Mecab-Swift/blob/1f096492e37fc05fc2e7304091f54889974c5368/LICENSE), [tests](https://github.com/shinjukunian/Mecab-Swift/tree/1f096492e37fc05fc2e7304091f54889974c5368/Tests), [release page](https://github.com/shinjukunian/Mecab-Swift/releases)

Verdict: **reject the bundled IPADic for new production adoption; adapt only the replaceable-dictionary/API lesson.** A future benchmark may compare a current compatible dictionary, but Sudachi currently has clearer dated-dictionary and source-range evidence.

### Lindera and Vibrato: defer; no maintained Swift package found in coverage

Lindera and Vibrato are maintained Rust analyzers rather than Swift packages in the covered repository search. Vibrato supports replaceable compiled dictionaries and user dictionaries and is dual MIT/Apache-2.0, but its documented starter dictionary is the same old IPADic 2.7.0 unless a different model is supplied. [Lindera repository](https://github.com/lindera/lindera), [Vibrato repository](https://github.com/daac-tools/vibrato)

Verdict: **defer**. A custom FFI/binary integration is larger and less proven on Swift/iOS than the inspected Sudachi binding, and none addresses #191 presentation.

### JmdictFurigana: adapt as build-time word-ruby evidence, not sentence analysis

JmdictFurigana publishes MIT-licensed monthly artifacts that map JMdict/JMnedict written forms and readings into word-internal furigana segments. Its documentation explicitly says it is not a lexical parser and discourages using it to annotate whole sentences. [project](https://github.com/Doublevil/JmdictFurigana), [latest releases](https://github.com/Doublevil/JmdictFurigana/releases), [license](https://github.com/Doublevil/JmdictFurigana/blob/8ab94725bedd23f5a566556519a892f78127fffb/LICENSE)

Its solver uses KANJIDIC readings plus multiple alignment algorithms and retains a result only when solutions agree or are unique, making it stronger precedent than inventing another word-internal alignment heuristic. [algorithm](https://github.com/Doublevil/JmdictFurigana#how-does-it-work)

Verdict: **adapt in a later data-import decision** by keying normalized segments to Zenbu's app-owned dictionary identities and pinned snapshots. Do not introduce the feed or modify data artifacts inside #191.

## Language Data Sources and import posture

### Keep the existing official-source pipeline

EDRDG identifies JMdict, JMnedict/ENAMDICT, KANJIDIC2, and KRADFILE/RADKFILE as covered dictionary files under CC BY-SA 4.0. Its license requires attribution, a Sources/About-style app location, and a regular procedure to update data; it also states that compliant software need not itself be open source. [EDRDG license](https://www.edrdg.org/edrdg/licence.html)

JMdict is generated daily from an almost-daily-updated source database. Zenbu already pins the official English XML by checksum and normalizes forms, readings, senses, rankings, and provenance into app-owned Language Reference Data. [JMdict project](https://www.edrdg.org/jmdict/j_jmdict.html), [Zenbu source manifest](../../apps/ios/LanguageData/Sources/JMdict_e-2026-08-10.source.json), [Zenbu import manifest](../../apps/ios/LanguageData/Generated/JMdict_e-2026-08-10.import.json)

KANJIDIC2 supplies kanji metadata/readings; KRADFILE provides visible-component membership and RADKFILE its inversion/stroke counts. Zenbu already pins, validates, and normalizes those into `KanjiReferenceEntry` rather than exposing source schemas. [EDRDG radical format](https://www.edrdg.org/krad/kradinf.html), [KANJIDIC source manifest](../../apps/ios/LanguageData/Sources/KANJIDIC2-2026-08-10.source.json), [radical importer](../../apps/ios/Tools/import_radicals.py), [kanji model](../../apps/ios/Modules/Sources/SearchExperience/KanjiLookupClient.swift)

KanjiVG is CC BY-SA 3.0 and supplies SVG stroke geometry. Zenbu already retains the license, pins a source checksum, and converts only ordered paths into an app-owned stroke schema. It is unrelated to ruby or token boundaries. [KanjiVG project/license](https://kanjivg.tagaini.net/), [Zenbu source manifest](../../apps/ios/LanguageData/Sources/KanjiVG-2025-08-16.source.json), [Zenbu import manifest](../../apps/ios/LanguageData/Generated/KanjiVG-2025-08-16.import.json)

Tatoeba's official downloads are CC BY 2.0 FR with a CC0 subset and weekly exports. Zenbu already pins Japanese/English sentences, links, detailed contributor exports, and CC0 lists, then creates app-owned pair identities while retaining record/license provenance. The repository separately records the accepted version-1.0 attribution risk; this note is not legal advice and does not expand that acceptance. [Tatoeba downloads](https://tatoeba.org/en/downloads), [Zenbu source manifest](../../apps/ios/LanguageData/Sources/Tatoeba-2026-08-08.source.json), [adapter](../../apps/ios/Tools/tatoeba_adapter.py), [accepted retrieval/licensing posture](../adr/0002-example-sentence-retrieval-contract.md)

JMnedict is a credible official source for proper names, but #191 does not require a new proper-name corpus. Adding it would be a Language Reference Data decision with its own snapshot, importer, identity, ranking, attribution, and tests. [EDRDG files and license](https://www.edrdg.org/edrdg/licence.html), [JMnedict project repository](https://github.com/edrdg/JMnedictDB)

Verdict: **adopt the current official pinned pipelines; defer JMnedict and JmdictFurigana to separately scoped data work. No new data source is needed for the #191 renderer prototype.**

### Jitendex/Yomitan are derived formats, not replacement authority

Yomitan publishes versioned JSON schemas for term, kanji, tag, and metadata banks. Those schemas are useful import validation/transport contracts but do not make every dictionary using them authoritative or redistributable. [Yomitan dictionary schemas](https://github.com/yomidevs/yomitan/blob/master/docs/making-yomitan-dictionaries.md), [schema files](https://github.com/yomidevs/yomitan/tree/master/ext/data/schemas)

Jitendex publishes recurrent Yomitan/MDict releases derived from JMdict and other sources under CC BY-SA 4.0, including generated JmdictFurigana data. Adopting its rich derived entries would introduce another provider/editorial layer and share-alike artifact rather than improve the #191 renderer. [Jitendex downloads](https://jitendex.org/pages/downloads.html), [Jitendex legal terms](https://jitendex.org/pages/legal.html), [version history](https://jitendex.org/pages/version-history.html)

Verdict: **defer Yomitan-format import support and reject Jitendex as a replacement for Zenbu's existing canonical importers in #191.**

## Evidence scorecard

| Candidate | Verdict | Trust signals | Blocking caveat |
| --- | --- | --- | --- |
| Core Text ruby/typesetting | **Adopt primitive** | Apple API; released OpenKoto implementation and ruby layout tests | No native inline interaction/AX proof. [Apple](https://developer.apple.com/documentation/coretext/ctrubyannotation), [OpenKoto](https://github.com/hikariming/openkoto/blob/9b99799ab9d3c56ebe1ac0a8f99b5192351f5fd4/openkoto-ios/Packages/OpenKotoKit/Sources/OKDesignSystem/Components/RubyTypesetter.swift) |
| `UITextView` + ruby + links | **Prototype** | Apple multiline attributed view and native text-item actions | Combined ruby rendering, height, rich AX, and hit regions undocumented. [Apple](https://developer.apple.com/documentation/uikit/uitextview) |
| SwiftUI `Text(AttributedString)` | **Reject for #191** | Native wrapping/link semantics; local probe passed hit-region/navigation | Apple ignores unsupported attributes; probe lost ruby and rich labels. [Apple](https://developer.apple.com/documentation/swiftui/text/init(_:)), [#191](https://github.com/serpcompany/zenbujapanese-monorepo/issues/191#issuecomment-5488626177) |
| OpenKoto ruby view | **Adapt evidence** | Current native iOS source, Core Text measurement, tests | Interaction and AX deliberately disabled; nonstandard additional license terms. [source](https://github.com/hikariming/openkoto/blob/9b99799ab9d3c56ebe1ac0a8f99b5192351f5fd4/openkoto-ios/Packages/OpenKotoKit/Sources/OKDesignSystem/Components/RubyLabel.swift), [license](https://github.com/hikariming/openkoto/blob/9b99799ab9d3c56ebe1ac0a8f99b5192351f5fd4/LICENSE) |
| Hoshi Reader | **Reject** | Active native iOS reader source | WebKit lookup shape and GPL-3.0; no native seam proof. [source](https://github.com/Manhhao/Hoshi-Reader/tree/784a94dd06b163e4e40d01e7d60452962bf7b90c), [license](https://github.com/Manhhao/Hoshi-Reader/blob/784a94dd06b163e4e40d01e7d60452962bf7b90c/LICENSE) |
| FuriganaTextView | **Reject** | MIT and historical releases | 2016 release line, old custom TextKit, no SPM/tests/link/AX. [releases](https://github.com/lingochamp/FuriganaTextView/releases), [source](https://github.com/lingochamp/FuriganaTextView/tree/03dc734c384cf50b1368607d3ab3c593ff8caedc) |
| FuriganaKit | **Reject** | MIT, Swift package, focused splitter tests | New/no releases, stack renderer, no link/AX, one local test failure. [source/tests](https://github.com/Toasha/FuriganaKit/tree/336360ddafc002cae26d9b9a5ad02a45b2027886) |
| Sudachi Swift binding | **Defer analyzer prototype** | Current dated dictionary pin, source ranges/readings, CI/coverage, Apache-2.0 | Very new binding; 40+ MB dictionary and notices; does not render. [source](https://github.com/iasnezhkov/sudachi-swift/tree/d816157863d76841ede10c4c0521e759b4349e65) |
| MeCab-Swift | **Reject bundled default; adapt boundary** | Replaceable dictionary protocol, token/ruby range APIs, MIT wrapper | Bundled IPADic is old; mixed licenses; no renderer. [source](https://github.com/shinjukunian/Mecab-Swift/tree/1f096492e37fc05fc2e7304091f54889974c5368) |
| JmdictFurigana | **Defer build-time adapter** | Monthly artifacts, MIT code, explicit conservative solver | Word-only, not a sentence tokenizer; derived from licensed data. [project](https://github.com/Doublevil/JmdictFurigana) |
| Current Zenbu source importers | **Adopt** | Pinned checksums, app-owned normalization, provenance, tests/ADRs | EDRDG update/attribution and Tatoeba accepted-risk obligations remain. [manifests](../../apps/ios/LanguageData/Generated), [ADRs](../adr) |

## Bounded prototype acceptance gate

The prototype changes no Language Data Source, `DictionaryEntry`, `KanjiReferenceEntry`, `ExampleSentence`, ranking/retrieval policy, or production dependency. It uses the current eight-row `いる` fixture and current `JapaneseTextToken`/`DictionaryEntry` outputs. [representative reproduction](https://github.com/serpcompany/zenbujapanese-monorepo/issues/191#issuecomment-5488333534)

Build two disposable render cases on the canonical iPhone 17 Pro Max / iOS 26 Simulator:

1. **Candidate T — TextKit:** one noneditable/selectable, nonscrolling `UITextView`; one attributed Japanese paragraph; Core Text ruby attributes on annotated base ranges; `.link` on ranges backed by `DictionaryEntry`; native text-item delegate action routes to Word Detail.
2. **Control S — SwiftUI:** the already proven `Text(AttributedString)` link case, retained only to compare compact flow, native link exposure, and loss of ruby/rich labels. [#191 control evidence](https://github.com/serpcompany/zenbujapanese-monorepo/issues/191#issuecomment-5488626177)

Candidate T may advance only if all of these are demonstrated together without suppressions or exceptions:

- the short, ruby/link, and long rows wrap compactly with no artificial 44-point gaps;
- ruby remains visibly attached after wrapping and at Accessibility XXXL;
- measured row height includes ruby, with no clipping, collision, or overlap in light and dark appearance;
- every representative linked range is publicly exposed as a link, has the exact `surface, reading, summary` label, and activates the canonical Word Detail once;
- `.hitRegion`, `.textClipped`, and Dynamic Type audits pass;
- adjacent linked ranges have no overlapping activation regions, and boundary taps deterministically activate the intended token;
- VoiceOver traversal order follows sentence order, while punctuation/unlinked text remains intelligible;
- the speaker remains separately reachable and stacks below the Japanese paragraph at accessibility sizes;
- scrolling keeps the first and eighth representative rows reachable.

If TextKit drops ruby, under-measures wrapped ruby, collapses range labels, overlaps targets, or requires manual glyph drawing, stop. Report that evidence back to #191; do not silently continue into a custom renderer.

Only after that failed gate may an owner separately authorize **Candidate C — Core Text interaction shell**: reuse the platform's `CTTypesetter`/`CTLine` typography, map app-owned token ranges onto line/run geometry, and construct app-owned touch and accessibility elements. That is smaller than inventing line breaking or ruby placement, but it still makes Zenbu responsible for per-range hit testing and accessibility and therefore remains outside the bounded #191 correction until explicitly approved. [Core Text line API](https://developer.apple.com/documentation/coretext/ctline), [UIKit accessibility element](https://developer.apple.com/documentation/uikit/uiaccessibilityelement)

## Exact next decision

Approve or decline the **TextKit-only prototype gate** above.

Approval does not authorize a production implementation, a package dependency, new/changed language data, analyzer adoption, issue closure, PR merge, or release. A successful prototype would justify a small UIKit bridge that consumes the existing app-owned tokens and callbacks. A failed prototype returns #191 to the existing product/architecture choice with stronger evidence; it does not automatically authorize a bespoke renderer.

## Licensing caveats

This is an engineering inventory, not legal advice.

- Apple system frameworks add no bundled third-party code, making the TextKit/Core Text probe the lowest license-risk path. [Apple SDK agreement portal](https://developer.apple.com/support/terms/)
- EDRDG data is CC BY-SA 4.0 with explicit acknowledgement and regular-update conditions; source-derived artifacts and in-app source links must retain the current compliance posture. [EDRDG license](https://www.edrdg.org/edrdg/licence.html)
- Tatoeba exports are principally CC BY 2.0 FR with a CC0 subset; Zenbu's accepted attribution-risk decision remains narrow and unchanged. [Tatoeba downloads](https://tatoeba.org/en/downloads), [ADR 0002](../adr/0002-example-sentence-retrieval-contract.md)
- KanjiVG is CC BY-SA 3.0; it is already isolated to stroke geometry and is irrelevant to #191 text layout. [KanjiVG license](https://kanjivg.tagaini.net/)
- GPL-3.0 Hoshi code should not be copied into the current app without a deliberate distribution/licensing decision. [Hoshi license](https://github.com/Manhhao/Hoshi-Reader/blob/784a94dd06b163e4e40d01e7d60452962bf7b90c/LICENSE)
- OpenKoto's additional license conditions require review before code reuse even though its file references Apache 2.0. [OpenKoto license](https://github.com/hikariming/openkoto/blob/9b99799ab9d3c56ebe1ac0a8f99b5192351f5fd4/LICENSE)
- Sudachi's wrapper/core are Apache-2.0, but a bundled SudachiDict carries third-party notices; MeCab-Swift's MIT wrapper does not erase the separate MeCab/IPADic terms. [Sudachi notice](https://github.com/iasnezhkov/sudachi-swift/blob/d816157863d76841ede10c4c0521e759b4349e65/NOTICE), [MeCab-Swift manifest](https://github.com/shinjukunian/Mecab-Swift/blob/1f096492e37fc05fc2e7304091f54889974c5368/Package.swift)
- Jitendex is CC BY-SA 4.0 derived content, while Yomitan schemas are format definitions; neither should be treated as automatically interchangeable with Zenbu's official-source pipeline. [Jitendex legal](https://jitendex.org/pages/legal.html), [Yomitan schemas](https://github.com/yomidevs/yomitan/tree/master/ext/data/schemas)
