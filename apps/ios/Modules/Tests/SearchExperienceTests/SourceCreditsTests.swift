import Foundation
import Testing

@testable import SearchExperience

@Suite("Source credits")
struct SourceCreditsTests {
  @Test("Credits & Attributions shows the credits the core lists for the app, in its order")
  func creditsComeFromTheCore() throws {
    let client = "app"
    let asked: SourceCredits = try PresentationCore.shared.answer("sourceCredits", client)
    #expect(SourceCredits.shown == asked)
    #expect(SourceCredits.asked { asked } == asked)
    #expect(
      asked.credits.map(\.id) == [
        "jmdict", "kanjidic2", "radkfile", "kanjivg", "kanjium", "unidic", "jlpt", "jlptKanji",
        "tubelex", "wikipedia", "jiten", "sudachi", "kuromoji", "tatoeba", "dakanji",
      ])
    for credit in asked.credits {
      #expect(!credit.name.isEmpty, "\(credit.id)")
      #expect(credit.credit.hasSuffix("."), "\(credit.id)")
      #expect(!credit.license.name.isEmpty, "\(credit.id)")
      #expect(credit.url.scheme == "https", "\(credit.id)")
    }
  }

  @Test("Jiten's credit says its lists were modified, and carries the share-alike notice")
  func jitenNotice() throws {
    let jiten = try #require(SourceCredits.shown?.credit("jiten"))
    #expect(jiten.credit.hasSuffix("by Jiten (jiten.moe), modified."))
    #expect(jiten.license.name == "CC BY-SA 4.0")
    #expect(
      jiten.notice
        == "The rankings from Jiten are adapted from its data, and are shared under the same licence, CC BY-SA 4.0."
    )
  }

  @Test("the Wikipedia list has its project's name, and the screen says every source is converted")
  func sharedWording() throws {
    let shown = try #require(SourceCredits.shown)
    #expect(shown.credit("wikipedia")?.name == "Wikipedia Word Frequency Clean")
    #expect(shown.credit("jlpt")?.name == "JLPT vocabulary lists")
    #expect(shown.credit("jmdict")?.license.name == "EDRDG licence, CC BY-SA 4.0")
    #expect(
      shown.conversionNotice
        == "Zenbu converts each source into its own formats and shares converted Creative Commons data under the same licence."
    )
  }

  @Test("the Licenses screen names each license text, and each linked license, as the core does")
  func licensesFollowTheCredits() throws {
    let shown = try #require(SourceCredits.shown)
    for file in BundledLicenseText.listed {
      let credited = file.source.map { shown.credit($0) != nil }
      #expect(credited ?? (file.package != nil), "\(file.id)")
    }
    #expect(
      BundledLicenseText.listed.map { $0.title(in: shown) } == [
        "KanjiVG", "UniDic", "JLPT vocabulary lists", "TUBELEX", "Wikipedia Word Frequency Clean",
        "Sudachi", "Kuromoji", "IPADIC", "Tatoeba", "DaKanji", "Sentry", "ZIPFoundation",
      ])
    let terms = BundledLicenseText.sourcesWithLinkedTerms.compactMap { shown.credit($0)?.license }
    #expect(terms.map(\.name) == ["EDRDG licence, CC BY-SA 4.0", "CC BY-SA 4.0", "CC BY 2.0 FR"])
    #expect(
      terms.map(\.url?.absoluteString) == [
        "https://www.edrdg.org/edrdg/licence.html",
        "https://creativecommons.org/licenses/by-sa/4.0/",
        "https://creativecommons.org/licenses/by/2.0/fr/",
      ])
  }

  @Test("an answer the app can't use shows no credits, and Licenses still lists every bundled text")
  func unavailableCredits() throws {
    #expect(SourceCredits.asked { throw DictionaryCoreError.bundleUnavailable } == nil)
    #expect(SourceCredits.asked { SourceCredits(conversionNotice: "", credits: []) } == nil)
    let withoutALicenseLink = Data(
      #"{"conversionNotice":"","credits":[{"id":"a","name":"A","url":"https://a.example/","credit":"A.","license":{"name":"L","url":""}}]}"#
        .utf8)
    #expect(
      SourceCredits.asked { try JSONDecoder().decode(SourceCredits.self, from: withoutALicenseLink) }
        == nil)
    #expect(
      BundledLicenseText.listed.map { $0.title(in: nil) } == [
        "KANJIVG-CC-BY-SA-3.0", "UNIDIC-NEW-BSD", "JLPT-VOCABULARY-CC-BY-SA-4.0",
        "TUBELEX-BSD-3-CLAUSE", "WIKIPEDIA-FREQUENCY-BSD-3-CLAUSE",
        "SudachiLanguageTechnologyNotices", "LICENSE-2.0", "IPADIC", "TATOEBA-NOTICE",
        "DAKANJI-MIT", "Sentry", "ZIPFoundation",
      ])
  }

  @Test("each license text Licenses lists is bundled, and each package's has its copyright line")
  func licenseTextsAreBundled() {
    for file in BundledLicenseText.listed {
      #expect(file.contents?.isEmpty == false, "\(file.id)")
    }
    let packages = BundledLicenseText.listed.filter { $0.package != nil }
    #expect(packages.map(\.package) == ["sudachi-swift", "sentry-cocoa", "zipfoundation"])
    let copyrights = packages.map { file in
      file.contents?.split(separator: "\n").first { $0.hasPrefix("Copyright ") }.map(String.init)
    }
    #expect(
      copyrights == [
        "Copyright 2026 Ilia Snezhkov", "Copyright (c) 2015 Sentry",
        "Copyright (c) 2017-2025 Thomas Zoechling (https://www.peakstep.com)",
      ])
  }
}
