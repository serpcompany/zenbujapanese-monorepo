import Darwin.Mach
import XCTest

@testable import SearchExperience

final class JapaneseTextAnalysisTests: XCTestCase {
  func testProviderEvidenceSeparatesTodayFromTopicParticleWithoutGreetingLink() async throws {
    let lookup = LookupClient.freshBundledDatabase()
    let tokens = await analyzer(lookup).linkedTokens(
      "今日は静かな公園です。",
      SearchQuery(""),
      nil
    )

    XCTAssertEqual(tokens.map(\.surface), ["今日", "は", "静か", "な", "公園", "です", "。"])
    XCTAssertFalse(tokens.contains { $0.entry?.headword == "こんにちは" })
    XCTAssertEqual(tokens.first { $0.surface == "静か" }?.entry?.headword, "静か")
  }

  func testProviderDictionaryFormsResolveInflectedVerbsWithoutNounOrIteLinks() async throws {
    let lookup = LookupClient.freshBundledDatabase()
    let tokens = await analyzer(lookup).linkedTokens(
      "問題を解いて、友達と話します。",
      SearchQuery(""),
      nil
    )

    let solve = try XCTUnwrap(tokens.first { $0.surface == "解い" })
    XCTAssertEqual(solve.dictionaryForm, "解く")
    XCTAssertNil(solve.entry, "Two defensible 解く readings must remain unresolved.")
    XCTAssertEqual(solve.candidateEntryIDs.count, 2)
    XCTAssertEqual(solve.candidateEntries.map(\.id), solve.candidateEntryIDs)
    XCTAssertFalse(tokens.contains { $0.entry?.headword == "射手" })
    let speak = try XCTUnwrap(tokens.first { $0.surface == "話し" })
    XCTAssertEqual(speak.entry?.headword, "話す")
    XCTAssertFalse(tokens.contains { $0.surface == "話し" && $0.entry?.headword == "話" })
  }

  func testContradictoryProviderPartOfSpeechFailsClosedInsteadOfLinkingAUniqueEntry() async throws {
    let lookup = LookupClient.freshBundledDatabase()
    let client = JapaneseTextAnalysisClient.resolving(
      morphologyClient: JapaneseMorphologyClient { _ in
        JapaneseMorphologyAnalysis(
          transcript: "日本語",
          candidates: [
            JapaneseMorphologyCandidate(
              surface: "日本語",
              scalarRange: 0..<3,
              dictionaryForm: "日本語",
              normalizedForm: "日本語",
              reading: "ニホンゴ",
              partOfSpeech: ["動詞"],
              isOutOfVocabulary: false,
              children: []
            )
          ],
          engine: "frozen-test-provider",
          engineVersion: "1",
          dictionary: "independent test truth",
          dictionarySHA256: "fixture"
        )
      },
      lookupClient: lookup
    )

    let linkedTokens = await client.linkedTokens("日本語", SearchQuery(""), nil)
    let token = try XCTUnwrap(linkedTokens.first)

    XCTAssertNil(token.entry)
    XCTAssertTrue(token.candidateEntries.isEmpty)
  }

  func testProviderKatakanaReadingMatchesTheAppOwnedHiraganaEntry() async throws {
    let lookup = LookupClient.freshBundledDatabase()
    let client = JapaneseTextAnalysisClient.resolving(
      morphologyClient: .uiTestFixture,
      lookupClient: lookup
    )

    let tokens = await client.linkedTokens("日本語の勉強", SearchQuery(""), nil)

    let japanese = try XCTUnwrap(tokens.first { $0.surface == "日本語" })
    XCTAssertEqual(japanese.entry?.id.rawValue, "c81e1608bebbf039176be3e23f1c03bb")
  }

  func testBareWrittenHomographsRemainASelectableFamilyInsteadOfAutoLinking() async throws {
    let lookup = LookupClient.freshBundledDatabase()
    let morphology = JapaneseMorphologyClient { text in
      JapaneseMorphologyAnalysis(
        transcript: text,
        candidates: [
          JapaneseMorphologyCandidate(
            surface: text,
            scalarRange: 0..<text.unicodeScalars.count,
            dictionaryForm: text,
            normalizedForm: text,
            reading: text == "静" ? "セイ" : "トクホン",
            partOfSpeech: ["名詞"],
            isOutOfVocabulary: false,
            children: []
          )
        ],
        engine: "frozen-test-provider",
        engineVersion: "1",
        dictionary: "independent test truth",
        dictionarySHA256: "fixture"
      )
    }
    let client = JapaneseTextAnalysisClient.resolving(
      morphologyClient: morphology,
      lookupClient: lookup
    )

    for surface in ["静", "読本"] {
      let tokens = await client.linkedTokens(surface, SearchQuery(""), nil)
      let token = try XCTUnwrap(tokens.first)
      XCTAssertNil(token.entry, surface)
      XCTAssertGreaterThan(token.candidateEntries.count, 1, surface)
    }
  }

  func testUnavailablePackReturnsExactRawTextWithoutFabricatedLinks() async {
    let lookup = LookupClient.freshBundledDatabase()
    let client = JapaneseTextAnalysisClient.resolving(
      morphologyClient: JapaneseMorphologyClient { _ in
        throw JapaneseMorphologyError.packUnavailable
      },
      lookupClient: lookup
    )

    let tokens = await client.linkedTokens("今日は静かな公園です。", SearchQuery(""), nil)

    XCTAssertEqual(tokens.map(\.surface), ["今日は静かな公園です。"])
    XCTAssertEqual(tokens.first?.scalarRange, 0..<11)
    XCTAssertTrue(tokens.allSatisfy { $0.entry == nil })
  }

  func testModeAChildIdentityNeverLeaksOntoItsModeCParentCandidate() async throws {
    let lookup = LookupClient.freshBundledDatabase()
    let matchedCommitteeMember = try await lookup.entryMatchingForm("委員")
    let committeeMember = try XCTUnwrap(matchedCommitteeMember)
    let child = JapaneseMorphologyCandidate(
      surface: "委員",
      scalarRange: 0..<2,
      dictionaryForm: "委員",
      normalizedForm: "委員",
      reading: "イイン",
      partOfSpeech: ["名詞"],
      isOutOfVocabulary: false,
      children: []
    )
    let suffix = JapaneseMorphologyCandidate(
      surface: "会",
      scalarRange: 2..<3,
      dictionaryForm: "会",
      normalizedForm: "会",
      reading: "カイ",
      partOfSpeech: ["接尾辞"],
      isOutOfVocabulary: false,
      children: []
    )
    let client = JapaneseTextAnalysisClient.resolving(
      morphologyClient: JapaneseMorphologyClient { _ in
        JapaneseMorphologyAnalysis(
          transcript: "委員会",
          candidates: [
            JapaneseMorphologyCandidate(
              surface: "委員会",
              scalarRange: 0..<3,
              dictionaryForm: "委員会",
              normalizedForm: "委員会",
              reading: "イインカイ",
              partOfSpeech: ["名詞"],
              isOutOfVocabulary: false,
              children: [child, suffix]
            )
          ],
          engine: "frozen-test-provider",
          engineVersion: "1",
          dictionary: "independent test truth",
          dictionarySHA256: "fixture"
        )
      },
      lookupClient: lookup
    )

    let linked = await client.linkedTokens("委員会", SearchQuery("委員"), committeeMember)
    let token = try XCTUnwrap(linked.first)
    XCTAssertNotEqual(token.entry?.id, committeeMember.id)
    XCTAssertFalse(token.candidateEntryIDs.contains(committeeMember.id))
  }

  func testInflectedOccurrencesRepresentTheCurrentCanonicalEntry() async throws {
    let lookup = LookupClient.freshBundledDatabase()
    let matchedEntry = try await lookup.entryMatchingForm("見る")
    let currentEntry = try XCTUnwrap(matchedEntry)
    let tokens = await analyzer(lookup).linkedTokens(
      "見て、見て。",
      SearchQuery(currentEntry.headword),
      currentEntry
    )

    let occurrences = tokens.filter { $0.surface == "見て" }
    XCTAssertEqual(occurrences.count, 2)
    XCTAssertTrue(occurrences.allSatisfy { $0.represents(currentEntry) })
  }

  func testExplicitHighlightedEntryOwnsItsKanaReadingOccurrence() async throws {
    let lookup = LookupClient.freshBundledDatabase()
    let matchedEntry = try await lookup.entryMatchingForm("要る")
    let highlightedEntry = try XCTUnwrap(matchedEntry)
    let tokens = await analyzer(lookup).linkedTokens(
      "車がいるの？",
      SearchQuery(highlightedEntry.headword),
      highlightedEntry
    )
    let occurrence = try XCTUnwrap(tokens.first { $0.surface == "いる" })
    XCTAssertEqual(occurrence.entry?.id, highlightedEntry.id)
    XCTAssertEqual(occurrence.entry?.headword, "要る")
    XCTAssertEqual(occurrence.entry?.reading, "いる")
    XCTAssertEqual(
      occurrence.entry?.summary,
      "to be needed, to be necessary, to be required, to be wanted, to need, to want"
    )
  }

  func testAmbiguousKanaHomographKeepsWordBoundaryWithoutChoosingAnEntry() async throws {
    let lookup = LookupClient.freshBundledDatabase()
    let tokens = await analyzer(lookup).linkedTokens(
      "車がいるの？",
      SearchQuery("いる"),
      nil
    )

    XCTAssertEqual(tokens.map(\.surface).joined(), "車がいるの？")
    XCTAssertFalse(tokens.contains { $0.surface == "がい" })
    let occurrence = try XCTUnwrap(tokens.first { $0.surface == "いる" })
    XCTAssertNil(occurrence.entry)
    XCTAssertGreaterThan(occurrence.candidateEntryIDs.count, 1)
  }

  func testHighlightedEntryFormsReserveBoundariesFromParticlesAndPunctuation() async throws {
    let lookup = LookupClient.freshBundledDatabase()
    let cases = [
      (
        id: "8647047758cffbea50d72922fad277e0",
        text: "彼がいる？",
        surface: "いる",
        headword: "いる"
      ),
      (
        id: "8647047758cffbea50d72922fad277e0",
        text: "彼が居る。",
        surface: "居る",
        headword: "いる"
      ),
      (
        id: "e85ded84cc6528b1785230911b2ab431",
        text: "いる。",
        surface: "いる",
        headword: "射る"
      ),
      (
        id: "856095faec102f96bc40f7c592b41f21",
        text: "豆を煎る。",
        surface: "煎る",
        headword: "炒る"
      ),
    ]

    for example in cases {
      let matchedEntry = try await lookup.entry(LanguageReferenceID(rawValue: example.id))
      let highlightedEntry = try XCTUnwrap(matchedEntry)
      let tokens = await analyzer(lookup).linkedTokens(
        example.text,
        SearchQuery(highlightedEntry.headword),
        highlightedEntry
      )

      XCTAssertEqual(tokens.map(\.surface).joined(), example.text, example.text)
      let occurrence = try XCTUnwrap(
        tokens.first { $0.surface == example.surface },
        "\(example.text): \(tokens.map { "\($0.surface)=\($0.entry?.headword ?? "nil")" })")
      XCTAssertEqual(occurrence.entry?.id, highlightedEntry.id, example.text)
      XCTAssertEqual(occurrence.entry?.headword, example.headword, example.text)
      XCTAssertFalse(tokens.contains { $0.surface == "がい" }, example.text)
    }
  }

  func testOtherVerbsRemainSeparateFromAdjacentParticles() async throws {
    let lookup = LookupClient.freshBundledDatabase()
    let analyzer = analyzer(lookup)
    let cases = [
      (text: "猫を見る。", surface: "見る", headword: "見る"),
      (text: "ご飯を食べる。", surface: "食べる", headword: "食べる"),
      (text: "見ているだけだ。", surface: "見て", headword: "見る"),
    ]

    for example in cases {
      let tokens = await analyzer.linkedTokens(example.text, SearchQuery(""), nil)
      XCTAssertEqual(tokens.map(\.surface).joined(), example.text, example.text)
      let occurrence = try XCTUnwrap(tokens.first { $0.surface == example.surface })
      XCTAssertEqual(occurrence.entry?.headword, example.headword, example.text)
    }
  }

  func testHighlightedReadingDoesNotSplitACompleteLongerDictionaryForm() async throws {
    let lookup = LookupClient.freshBundledDatabase()
    let matchedEntry = try await lookup.entry(
      LanguageReferenceID(rawValue: "d12d09f1107aef0f7d43b54b62f0b7e1"))
    let highlightedEntry = try XCTUnwrap(matchedEntry)
    let tokens = await analyzer(lookup).linkedTokens(
      "道具を用いる。",
      SearchQuery(highlightedEntry.headword),
      highlightedEntry
    )

    XCTAssertEqual(tokens.map(\.surface).joined(), "道具を用いる。")
    XCTAssertFalse(tokens.contains { $0.surface == "いる" })
    let occurrence = try XCTUnwrap(tokens.first { $0.surface == "用いる" })
    XCTAssertEqual(occurrence.entry?.headword, "用いる")
  }

  func testShippedSudachiAdapterMatchesFrozenProviderContract() async throws {
    let dictionaryURL = try await OfficialSudachiTestResource.shared.installedDictionaryURL()
    let baselineResidentBytes = Self.residentBytes()
    let coldStart = ContinuousClock.now
    let client = try JapaneseMorphologyClient.sudachiCore(
      dictionaryURL: dictionaryURL)
    let coldMilliseconds = Self.milliseconds(coldStart.duration(to: .now))
    let analysis = try await client.analyze("日本語の勉強。問題を解いて話します。")

    XCTAssertEqual(analysis.engine, "sudachi.rs")
    XCTAssertEqual(analysis.engineVersion, "0.6.11")
    XCTAssertEqual(analysis.dictionary, "SudachiDict Core 20260723")
    XCTAssertEqual(
      analysis.dictionarySHA256,
      "53fa281d11eef3769712fe1c3c892117338f9892bee6daf4dad51daa5281bb6f")
    XCTAssertEqual(analysis.candidates.map(\.surface).joined(), analysis.transcript)
    XCTAssertEqual(analysis.candidates.first?.surface, "日本語")
    XCTAssertEqual(analysis.candidates.first?.reading, "ニホンゴ")
    XCTAssertTrue(analysis.candidates.contains { $0.surface == "解い" && $0.dictionaryForm == "解く" })
    XCTAssertTrue(analysis.candidates.contains { $0.surface == "話し" && $0.dictionaryForm == "話す" })

    let lookup = LookupClient.freshBundledDatabase()
    let linked = JapaneseTextAnalysisClient.resolving(
      morphologyClient: client,
      lookupClient: lookup
    )
    let tokens = await linked.linkedTokens(
      "日本語の勉強。今日は問題を解いて話します。そこに学生がいる。用いる。",
      SearchQuery(""),
      nil
    )
    XCTAssertEqual(tokens.map(\.surface).joined(), "日本語の勉強。今日は問題を解いて話します。そこに学生がいる。用いる。")
    XCTAssertEqual(tokens.first { $0.surface == "日本語" }?.entry?.headword, "日本語")
    XCTAssertFalse(tokens.contains { $0.entry?.headword == "こんにちは" })
    XCTAssertEqual(tokens.first { $0.surface == "解い" }?.dictionaryForm, "解く")
    XCTAssertNil(tokens.first { $0.surface == "解い" }?.entry)
    XCTAssertEqual(tokens.first { $0.surface == "話し" }?.entry?.headword, "話す")
    XCTAssertNil(tokens.first { $0.surface == "いる" }?.entry)
    XCTAssertEqual(tokens.first { $0.surface == "用いる" }?.entry?.headword, "用いる")

    var warmMilliseconds: [Double] = []
    for index in 0..<220 {
      let start = ContinuousClock.now
      _ = try await client.analyze(index.isMultiple(of: 2) ? analysis.transcript : "日本語を用いる。")
      if index >= 20 { warmMilliseconds.append(Self.milliseconds(start.duration(to: .now))) }
    }
    let warmP95 = warmMilliseconds.sorted()[189]
    XCTAssertLessThan(coldMilliseconds, 1_000)
    XCTAssertLessThan(warmP95, 100)
    let residentBytes = Self.residentBytes()
    XCTAssertGreaterThan(residentBytes, 0)
    XCTAssertGreaterThanOrEqual(residentBytes, baselineResidentBytes)
    XCTAssertLessThan(residentBytes - baselineResidentBytes, 350 * 1_024 * 1_024)
  }

  func testShippedSudachiAdapterRetainsFrozenConfirmationQuality() async throws {
    let dictionaryURL = try await OfficialSudachiTestResource.shared.installedDictionaryURL()
    let truthURL = try XCTUnwrap(
      Bundle(for: JapaneseTextAnalysisTests.self).url(
        forResource: "issue251-morphology-confirmation-holdout-v1", withExtension: "json"))
    let truth = try JSONDecoder().decode(
      ConfirmationTruth.self, from: Data(contentsOf: truthURL))
    XCTAssertEqual(truth.cases.count, 512)
    let client = try JapaneseMorphologyClient.sudachiCore(dictionaryURL: dictionaryURL)
    let confirmationStart = ContinuousClock.now
    var predictedBoundaryCount = 0
    var goldBoundaryCount = 0
    var matchingBoundaryCount = 0
    var exactSpanCount = 0
    var lemmaMatches = 0
    var readingMatches = 0
    var readingApplicable = 0
    var partOfSpeechMatches = 0
    var sentenceAllCorrect = 0

    for record in truth.cases {
      let analysis = try await client.analyze(record.text)
      let provider = analysis.candidates.flatMap { candidate in
        candidate.children.isEmpty ? [candidate] : candidate.children
      }
      let finalOffset = record.text.unicodeScalars.count
      let predictedEdges = Set(provider.map(\.scalarRange.upperBound).filter { $0 < finalOffset })
      let goldEdges = Set(record.tokens.map(\.end).filter { $0 < finalOffset })
      let predictedRanges = Set(
        provider.map(\.scalarRange)
      )
      let goldRanges = Set(record.tokens.map { $0.start..<$0.end })
      var recordIsCorrect = predictedEdges == goldEdges && predictedRanges == goldRanges
      predictedBoundaryCount += predictedEdges.count
      goldBoundaryCount += goldEdges.count
      matchingBoundaryCount += predictedEdges.intersection(goldEdges).count
      let providerByRange = Dictionary(grouping: provider, by: \.scalarRange)
      for token in record.tokens {
        guard let candidate = providerByRange[token.start..<token.end]?.first else {
          recordIsCorrect = false
          continue
        }
        exactSpanCount += 1
        if candidate.dictionaryForm == token.lemma {
          lemmaMatches += 1
        } else {
          recordIsCorrect = false
        }
        if !token.readingAlternatives.isEmpty {
          readingApplicable += 1
          if token.readingAlternatives.contains(candidate.reading) {
            readingMatches += 1
          } else {
            recordIsCorrect = false
          }
        }
        if candidate.coarsePartOfSpeech == token.partOfSpeech {
          partOfSpeechMatches += 1
        } else {
          recordIsCorrect = false
        }
      }
      sentenceAllCorrect += recordIsCorrect ? 1 : 0
    }

    let boundaryPrecision = Double(matchingBoundaryCount) / Double(predictedBoundaryCount)
    let boundaryRecall = Double(matchingBoundaryCount) / Double(goldBoundaryCount)
    let boundaryF1 = 2 * boundaryPrecision * boundaryRecall / (boundaryPrecision + boundaryRecall)
    let goldTokenCount = truth.cases.reduce(0) { $0 + $1.tokens.count }
    XCTAssertGreaterThanOrEqual(boundaryF1, 0.990)
    XCTAssertGreaterThanOrEqual(Double(exactSpanCount) / Double(goldTokenCount), 0.976)
    XCTAssertGreaterThanOrEqual(Double(lemmaMatches) / Double(exactSpanCount), 0.850)
    XCTAssertGreaterThanOrEqual(Double(readingMatches) / Double(readingApplicable), 0.949)
    XCTAssertGreaterThanOrEqual(Double(partOfSpeechMatches) / Double(goldTokenCount), 0.899)
    XCTAssertGreaterThanOrEqual(sentenceAllCorrect, 29)
    XCTAssertLessThan(Self.milliseconds(confirmationStart.duration(to: .now)), 5_000)
  }

  func testShippedAdapterMatchesFrozenHardCaseFieldsAndAppOwnedLinkPolicy() async throws {
    let dictionaryURL = try await OfficialSudachiTestResource.shared.installedDictionaryURL()
    let truthURL = try XCTUnwrap(
      Bundle(for: JapaneseTextAnalysisTests.self).url(
        forResource: "issue251-morphology-hard-cases-v1", withExtension: "json"))
    let truth = try JSONDecoder().decode(HardCaseTruth.self, from: Data(contentsOf: truthURL))
    XCTAssertEqual(truth.cases.count, 10)
    let morphology = try JapaneseMorphologyClient.sudachiCore(dictionaryURL: dictionaryURL)
    let linked = JapaneseTextAnalysisClient.resolving(
      morphologyClient: morphology,
      lookupClient: .freshBundledDatabase()
    )
    var allowedBoundaryMatches = 0
    var allowedBoundaryPredicted = 0
    var allowedBoundaryExpected = 0
    var lemma = (matches: 0, total: 0)
    var reading = (matches: 0, total: 0)
    var partOfSpeech = (matches: 0, total: 0)
    var oov = (truePositive: 0, predicted: 0, expected: 0)
    var exactLinks = (matches: 0, total: 0)
    var abstentions = (matches: 0, total: 0)
    var severeWrongLinks = 0

    for record in truth.cases {
      let analysis = try await morphology.analyze(record.text)
      XCTAssertEqual(analysis.engine, SudachiCoreContract.engine)
      XCTAssertEqual(analysis.engineVersion, SudachiCoreContract.engineVersion)
      XCTAssertEqual(analysis.dictionary, SudachiCoreContract.dictionary)
      XCTAssertEqual(analysis.dictionarySHA256, SudachiCoreContract.dictionarySHA256)
      let candidates = analysis.candidates.flatMap(\.children)
      let finalOffset = record.text.unicodeScalars.count
      let edges = Set(
        candidates.map(\.scalarRange.upperBound).filter { $0 < finalOffset })
      let bestAllowed =
        record.allowedBoundaryEdgeSets.max { lhs, rhs in
          Self.f1(
            matches: edges.intersection(lhs).count, predicted: edges.count, expected: lhs.count)
            < Self.f1(
              matches: edges.intersection(rhs).count, predicted: edges.count, expected: rhs.count)
        } ?? []
      allowedBoundaryMatches += edges.intersection(bestAllowed).count
      allowedBoundaryPredicted += edges.count
      allowedBoundaryExpected += bestAllowed.count
      let byRange = Dictionary(grouping: candidates, by: \.scalarRange)

      for expected in record.tokens {
        let candidate = byRange[expected.start..<expected.end]?.first
        if let expectedLemma = expected.lemma {
          lemma.total += 1
          lemma.matches += candidate?.dictionaryForm == expectedLemma ? 1 : 0
        }
        if let expectedReading = expected.reading {
          reading.total += 1
          reading.matches += candidate?.reading == expectedReading ? 1 : 0
        }
        if let expectedPartOfSpeech = expected.partOfSpeech {
          partOfSpeech.total += 1
          partOfSpeech.matches += candidate?.coarsePartOfSpeech == expectedPartOfSpeech ? 1 : 0
        }
        let predictedOOV = candidate?.isOutOfVocabulary == true
        oov.truePositive += predictedOOV && expected.isOutOfVocabulary ? 1 : 0
        oov.predicted += predictedOOV ? 1 : 0
        oov.expected += expected.isOutOfVocabulary ? 1 : 0
      }

      let tokens = await linked.linkedTokens(record.text, SearchQuery(""), nil)
      for expected in record.tokens where expected.link != nil {
        let token = tokens.first { $0.scalarRange == expected.start..<expected.end }
        let linkedIDs = Set(
          (token?.candidateEntryIDs.map(\.rawValue) ?? [])
            + [token?.entry?.id.rawValue].compactMap { $0 })
        switch expected.link?.kind {
        case "exact":
          let allowed = Set(expected.link?.ids ?? [])
          exactLinks.total += 1
          exactLinks.matches += !linkedIDs.intersection(allowed).isEmpty ? 1 : 0
          if let chosen = token?.entry?.id.rawValue, !allowed.contains(chosen) {
            severeWrongLinks += 1
          }
        case "abstain":
          abstentions.total += 1
          abstentions.matches += token?.entry == nil ? 1 : 0
          severeWrongLinks += token?.entry == nil ? 0 : 1
        default:
          XCTFail("\(record.id): unsupported frozen link policy")
        }
      }
    }

    XCTAssertGreaterThanOrEqual(
      Self.f1(
        matches: allowedBoundaryMatches,
        predicted: allowedBoundaryPredicted,
        expected: allowedBoundaryExpected),
      0.968)
    XCTAssertGreaterThanOrEqual(Double(lemma.matches) / Double(lemma.total), 0.90)
    XCTAssertGreaterThanOrEqual(Double(reading.matches) / Double(reading.total), 0.96)
    XCTAssertGreaterThanOrEqual(Double(partOfSpeech.matches) / Double(partOfSpeech.total), 0.94)
    XCTAssertEqual(Double(oov.truePositive) / Double(oov.predicted), 1.0)
    XCTAssertGreaterThanOrEqual(Double(oov.truePositive) / Double(oov.expected), 0.20)
    XCTAssertEqual(exactLinks.matches, exactLinks.total)
    XCTAssertEqual(abstentions.matches, abstentions.total)
    XCTAssertEqual(severeWrongLinks, 0)
  }

  private func analyzer(_ lookup: LookupClient) -> JapaneseTextAnalysisClient {
    JapaneseTextAnalysisClient.resolving(
      morphologyClient: JapaneseMorphologyClient { text in
        try Self.fixtureAnalysis(text)
      },
      lookupClient: lookup
    )
  }

  private static func fixtureAnalysis(_ text: String) throws -> JapaneseMorphologyAnalysis {
    let specifications: [(String, String, String)]
    switch text {
    case "今日は静かな公園です。":
      specifications = [
        ("今日", "今日", "名詞"), ("は", "は", "助詞"), ("静か", "静か", "形状詞"),
        ("な", "だ", "助動詞"), ("公園", "公園", "名詞"), ("です", "です", "助動詞"),
        ("。", "。", "補助記号"),
      ]
    case "問題を解いて、友達と話します。":
      specifications = [
        ("問題", "問題", "名詞"), ("を", "を", "助詞"), ("解い", "解く", "動詞"),
        ("て", "て", "助詞"), ("、", "、", "補助記号"), ("友達", "友達", "名詞"),
        ("と", "と", "助詞"), ("話し", "話す", "動詞"), ("ます", "ます", "助動詞"),
        ("。", "。", "補助記号"),
      ]
    case "見て、見て。":
      specifications = [
        ("見て", "見る", "動詞"), ("、", "、", "補助記号"),
        ("見て", "見る", "動詞"), ("。", "。", "補助記号"),
      ]
    case "車がいるの？":
      specifications = [
        ("車", "車", "名詞"), ("が", "が", "助詞"), ("いる", "居る", "動詞"),
        ("の", "の", "助詞"), ("？", "？", "補助記号"),
      ]
    case "彼がいる？":
      specifications = [
        ("彼", "彼", "代名詞"), ("が", "が", "助詞"), ("いる", "居る", "動詞"),
        ("？", "？", "補助記号"),
      ]
    case "彼が居る。":
      specifications = [
        ("彼", "彼", "代名詞"), ("が", "が", "助詞"), ("居る", "居る", "動詞"),
        ("。", "。", "補助記号"),
      ]
    case "いる。":
      specifications = [("いる", "居る", "動詞"), ("。", "。", "補助記号")]
    case "豆を煎る。":
      specifications = [
        ("豆", "豆", "名詞"), ("を", "を", "助詞"), ("煎る", "煎る", "動詞"),
        ("。", "。", "補助記号"),
      ]
    case "猫を見る。":
      specifications = [
        ("猫", "猫", "名詞"), ("を", "を", "助詞"), ("見る", "見る", "動詞"),
        ("。", "。", "補助記号"),
      ]
    case "ご飯を食べる。":
      specifications = [
        ("ご飯", "御飯", "名詞"), ("を", "を", "助詞"), ("食べる", "食べる", "動詞"),
        ("。", "。", "補助記号"),
      ]
    case "見ているだけだ。":
      specifications = [
        ("見て", "見る", "動詞"), ("いる", "居る", "動詞"), ("だけ", "だけ", "助詞"),
        ("だ", "だ", "助動詞"), ("。", "。", "補助記号"),
      ]
    case "道具を用いる。":
      specifications = [
        ("道具", "道具", "名詞"), ("を", "を", "助詞"), ("用いる", "用いる", "動詞"),
        ("。", "。", "補助記号"),
      ]
    default:
      specifications = [(text, text, "未知語")]
    }

    var offset = 0
    let candidates = specifications.map { surface, lemma, partOfSpeech in
      let count = surface.unicodeScalars.count
      defer { offset += count }
      return JapaneseMorphologyCandidate(
        surface: surface,
        scalarRange: offset..<(offset + count),
        dictionaryForm: lemma,
        normalizedForm: lemma,
        reading: "",
        partOfSpeech: [partOfSpeech],
        isOutOfVocabulary: partOfSpeech == "未知語",
        children: []
      )
    }
    return JapaneseMorphologyAnalysis(
      transcript: text,
      candidates: candidates,
      engine: "frozen-test-provider",
      engineVersion: "1",
      dictionary: "independent test truth",
      dictionarySHA256: "fixture"
    )
  }

  private static func milliseconds(_ duration: Duration) -> Double {
    Double(duration.components.seconds) * 1_000
      + Double(duration.components.attoseconds) / 1.0e15
  }

  private static func f1(matches: Int, predicted: Int, expected: Int) -> Double {
    let precision =
      predicted == 0 ? (expected == 0 ? 1.0 : 0.0) : Double(matches) / Double(predicted)
    let recall = expected == 0 ? 1.0 : Double(matches) / Double(expected)
    return precision + recall == 0 ? 0 : 2 * precision * recall / (precision + recall)
  }

  private static func residentBytes() -> UInt64 {
    var info = mach_task_basic_info()
    var count = mach_msg_type_number_t(
      MemoryLayout<mach_task_basic_info_data_t>.size / MemoryLayout<natural_t>.size)
    let result = withUnsafeMutablePointer(to: &info) {
      $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
        task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), $0, &count)
      }
    }
    return result == KERN_SUCCESS ? UInt64(info.resident_size) : 0
  }
}

private struct ConfirmationTruth: Decodable {
  let cases: [ConfirmationCase]
}

private struct ConfirmationCase: Decodable {
  let text: String
  let tokens: [ConfirmationToken]
}

private struct ConfirmationToken: Decodable {
  let surface: String
  let start: Int
  let end: Int
  let lemma: String
  let partOfSpeech: String
  let readingAlternatives: [String]

  enum CodingKeys: String, CodingKey {
    case surface, start, end, lemma, readingAlternatives
    case partOfSpeech = "pos"
  }
}

private struct HardCaseTruth: Decodable {
  let cases: [HardCase]
}

private struct HardCase: Decodable {
  let id: String
  let text: String
  let allowedBoundaryEdgeSets: [Set<Int>]
  let tokens: [HardCaseToken]
}

private struct HardCaseToken: Decodable {
  let surface: String
  let start: Int
  let end: Int
  let lemma: String?
  let reading: String?
  let partOfSpeech: String?
  let isOutOfVocabulary: Bool
  let link: HardCaseLink?

  enum CodingKeys: String, CodingKey {
    case surface, start, end, lemma, reading, link
    case partOfSpeech = "pos"
    case isOutOfVocabulary = "oov"
  }
}

private struct HardCaseLink: Decodable {
  let kind: String
  let ids: [String]

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    kind = try container.decode(String.self, forKey: .kind)
    ids = try container.decodeIfPresent([String].self, forKey: .ids) ?? []
  }

  enum CodingKeys: String, CodingKey { case kind, ids }
}

actor OfficialSudachiTestResource {
  static let shared = OfficialSudachiTestResource()
  private var cachedDictionaryURL: URL?

  func wheelData() async throws -> Data {
    let cache = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("issue252-sudachidict-core-20260723.whl")
    if let data = try? Data(contentsOf: cache, options: .mappedIfSafe),
      data.count == 72_275_897,
      data.sha256 == "b3869ce6b12b4bfa09575dc19030703bb669ab41bac12a74cafcbb28c6be2498"
    {
      return data
    }
    let source = URL(
      string:
        "https://github.com/WorksApplications/SudachiDict/releases/download/v20260723/sudachidict_core-20260723-py3-none-any.whl"
    )!
    let (data, response) = try await URLSession.shared.data(from: source)
    guard (response as? HTTPURLResponse)?.statusCode == 200,
      data.count == 72_275_897,
      data.sha256 == "b3869ce6b12b4bfa09575dc19030703bb669ab41bac12a74cafcbb28c6be2498"
    else { throw LanguageTechnologyPackError.checksumMismatch }
    try data.write(to: cache, options: .atomic)
    return data
  }

  func installedDictionaryURL() async throws -> URL {
    if let cachedDictionaryURL { return cachedDictionaryURL }
    let wheel = try await wheelData()
    let directory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("issue252-official-installed", isDirectory: true)
    let manager = try LanguageTechnologyPackManager(
      catalog: .bundled(),
      storageDirectory: directory,
      download: { _ in wheel }
    )
    if await manager.installedDictionaryURL() == nil {
      let id = try XCTUnwrap(LanguageTechnologyPackCatalog.bundled().packs.first?.packID)
      try await manager.download(id)
    }
    let installedURL = await manager.installedDictionaryURL()
    let installed = try XCTUnwrap(installedURL)
    cachedDictionaryURL = installed
    return installed
  }
}
