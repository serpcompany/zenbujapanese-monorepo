// swift-tools-version: 6.2

import PackageDescription

let package = Package(
  name: "ZenbuJapaneseModules",
  platforms: [.iOS(.v26), .macOS(.v26)],
  products: [
    .library(name: "SearchExperience", targets: ["SearchExperience"]),
    .library(name: "DictionaryData", targets: ["DictionaryData"]),
    .library(name: "TranslatorOnDevice", targets: ["TranslatorCore", "TranslatorOnDevice"]),
  ],
  dependencies: [
    .package(
      url: "https://github.com/getsentry/sentry-cocoa.git",
      exact: "9.30.2"
    ),
    .package(
      url: "https://github.com/iasnezhkov/sudachi-swift.git",
      exact: "0.1.1"
    ),
    .package(
      url: "https://github.com/weichsel/ZIPFoundation.git",
      exact: "0.9.20"
    ),
  ],
  targets: [
    .target(name: "TranslatorCore"),
    .target(name: "TranslatorOnDevice", dependencies: ["TranslatorCore"]),
    .testTarget(
      name: "TranslatorCoreTests",
      dependencies: ["TranslatorCore"]
    ),
    .target(
      name: "SearchExperience",
      dependencies: [
        "TranslatorCore",
        "TranslatorOnDevice",
        .product(name: "Sentry", package: "sentry-cocoa"),
        .product(name: "Sudachi", package: "sudachi-swift"),
        .product(name: "ZIPFoundation", package: "ZIPFoundation"),
      ],
      exclude: ["Resources"],
      linkerSettings: [
        .linkedFramework("JavaScriptCore"),
        .linkedLibrary("sqlite3"),
      ]
    ),
    .target(
      name: "DictionaryData",
      path: "Sources/SearchExperience/Resources",
      exclude: ["RankedLists.sqlite3"],
      sources: ["DictionaryData.swift"],
      resources: [
        .process("AccountRules"),
        .process("CompoundPitch.sqlite3"),
        .process("DAKANJI-MIT.txt"),
        .process("DaKanji.mlpackage"),
        .process("DictionaryCore"),
        .process("DictionaryRankingArtifactContract.json"),
        .process("ExampleWordIndex.sqlite3"),
        .process("FrequencyPackCatalog.json"),
        .process("FrequencyPackContentDigestV1.json"),
        .process("FrequencyPackMappingV1.sql"),
        .process("FrequencyPackMappingV2.sql"),
        .process("JLPT-VOCABULARY-CC-BY-SA-4.0.txt"),
        .process("JLPTLevelPack.sqlite3"),
        .process("KANJIVG-CC-BY-SA-3.0.txt"),
        .process("KanjiElementReferenceData.json"),
        .process("KanjiReferenceData.json"),
        .process("KanjiStrokeData.sqlite3"),
        .process("Kuromoji"),
        .process("LanguageReferenceData.sqlite3"),
        .process("LanguageTechnologyPackCatalog.json"),
        .process("RadicalReferenceData.json"),
        .process("SENTRY-COCOA-NOTICES.txt"),
        .process("SudachiLanguageTechnologyNotices.txt"),
        .process("SudachiRuntime"),
        .process("TATOEBA-NOTICE.txt"),
        .process("TUBELEX-BSD-3-CLAUSE.txt"),
        .process("TUBELEXFrequencyPack.sqlite3"),
        .process("UNIDIC-NEW-BSD.txt"),
        .process("WIKIPEDIA-FREQUENCY-BSD-3-CLAUSE.txt"),
        .process("ZIPFOUNDATION-MIT.txt"),
      ]
    ),
    .testTarget(
      name: "SearchExperienceTests",
      dependencies: [
        "SearchExperience",
        "DictionaryData",
        .product(name: "Sentry", package: "sentry-cocoa"),
      ],
      resources: [.copy("Fixtures")]
    ),
  ]
)
