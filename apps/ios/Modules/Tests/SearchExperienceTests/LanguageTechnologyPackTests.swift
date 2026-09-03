import Foundation
import XCTest

@testable import SearchExperience

final class LanguageTechnologyPackTests: XCTestCase {
  func testProviderContractRejectsEveryWrongGoldenEvidenceField() throws {
    let valid = Self.goldenAnalysis()
    XCTAssertNoThrow(try SudachiCoreContract.validateGoldenOutput(valid))

    for invalid in [
      Self.goldenAnalysis(engineVersion: "0.6.12"),
      Self.goldenAnalysis(dictionarySHA256: "wrong"),
      Self.goldenAnalysis(firstLemma: "日本"),
      Self.goldenAnalysis(firstReading: "ニッポンゴ"),
      Self.goldenAnalysis(firstPOS: "動詞"),
      Self.goldenAnalysis(firstIsOOV: true),
    ] {
      XCTAssertThrowsError(try SudachiCoreContract.validateGoldenOutput(invalid))
    }
  }

  func testProviderRangesMustCompletelyPartitionTranscriptAndEveryCandidate() throws {
    let valid = Self.goldenAnalysis()
    XCTAssertNoThrow(
      try JapaneseMorphologyProviderContract.validate(
        candidates: valid.candidates, transcript: valid.transcript))
    let omittedLeadingScalar = Array(valid.candidates.dropFirst())
    XCTAssertThrowsError(
      try JapaneseMorphologyProviderContract.validate(
        candidates: omittedLeadingScalar, transcript: valid.transcript))
    let first = valid.candidates[0]
    let childGap = JapaneseMorphologyCandidate(
      surface: first.surface,
      scalarRange: first.scalarRange,
      dictionaryForm: first.dictionaryForm,
      normalizedForm: first.normalizedForm,
      reading: first.reading,
      partOfSpeech: first.partOfSpeech,
      isOutOfVocabulary: first.isOutOfVocabulary,
      children: [Self.candidate("本語", range: 1..<3, lemma: "本語", reading: "ホンゴ", pos: "名詞")]
    )
    XCTAssertThrowsError(
      try JapaneseMorphologyProviderContract.validate(
        candidates: [childGap] + valid.candidates.dropFirst(), transcript: valid.transcript))
  }

  func testOfficialWheelInstallsRunsOfflineAndRetainsLastGood() async throws {
    let wheel = try await OfficialSudachiTestResource.shared.wheelData()
    let temporary = FileManager.default.temporaryDirectory
      .appendingPathComponent("LanguageTechnologyOfficialPack-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: temporary) }
    let catalog = try LanguageTechnologyPackCatalog.bundled()
    let manager = try LanguageTechnologyPackManager(
      catalog: catalog,
      storageDirectory: temporary,
      download: { _ in wheel }
    )

    let packID = try XCTUnwrap(catalog.packs.first?.packID)
    try await manager.download(packID)
    let installed = await manager.snapshot().packs[0]
    XCTAssertTrue(installed.isInstalled)
    XCTAssertEqual(installed.installedBytes, 217_466_039)
    let installedDictionaryURL = await manager.installedDictionaryURL()
    let dictionaryURL = try XCTUnwrap(installedDictionaryURL)
    let morphology = try JapaneseMorphologyClient.sudachiCore(dictionaryURL: dictionaryURL)
    let expected = try await morphology.analyze("今日は問題を解いて話します。用いる。")
    XCTAssertTrue(expected.candidates.contains { $0.surface == "今日" })
    XCTAssertTrue(expected.candidates.contains { $0.surface == "解い" && $0.dictionaryForm == "解く" })
    XCTAssertTrue(expected.candidates.contains { $0.surface == "話し" && $0.dictionaryForm == "話す" })
    XCTAssertTrue(expected.candidates.contains { $0.surface == "用いる" })

    let repeated = try await withThrowingTaskGroup(of: JapaneseMorphologyAnalysis.self) { group in
      for _ in 0..<100 { group.addTask { try await morphology.analyze(expected.transcript) } }
      return try await group.reduce(into: []) { $0.append($1) }
    }
    XCTAssertTrue(repeated.allSatisfy { $0 == expected })
    let cancelled = Task {
      try await morphology.analyze(String(repeating: expected.transcript, count: 100))
    }
    cancelled.cancel()
    await assertThrowsErrorAsync { _ = try await cancelled.value }

    let offline = try LanguageTechnologyPackManager(
      catalog: catalog,
      storageDirectory: temporary,
      download: { _ in throw URLError(.notConnectedToInternet) }
    )
    let relaunchedURL = await offline.installedDictionaryURL()
    XCTAssertEqual(relaunchedURL, dictionaryURL)
    await assertThrowsErrorAsync { try await offline.download(packID) }
    let retainedURL = await offline.installedDictionaryURL()
    XCTAssertEqual(retainedURL, dictionaryURL)
  }

  func testOfficialProductionCatalogPinsReviewedSudachiContractAndNotices() throws {
    let catalog = try LanguageTechnologyPackCatalog.bundled()
    let pack = try XCTUnwrap(catalog.packs.first)

    XCTAssertEqual(pack.engine, "sudachi.rs")
    XCTAssertEqual(pack.engineVersion, "0.6.11")
    XCTAssertEqual(pack.bindingVersion, "0.1.1")
    XCTAssertEqual(pack.packVersion, "20260723")
    XCTAssertEqual(pack.downloadBytes, 72_275_897)
    XCTAssertEqual(
      pack.downloadSHA256,
      "b3869ce6b12b4bfa09575dc19030703bb669ab41bac12a74cafcbb28c6be2498")
    XCTAssertEqual(pack.installedBytes, 217_466_039)
    XCTAssertEqual(
      pack.installedSHA256,
      "53fa281d11eef3769712fe1c3c892117338f9892bee6daf4dad51daa5281bb6f")
    XCTAssertEqual(pack.archiveEntry, "sudachidict_core/resources/system.dic")
    XCTAssertEqual(pack.runtimeResourceCommit, "90fd6068c80c2fc3b63e0dbab0e341475bad4d8f")
    XCTAssertTrue(pack.downloadURL.host == "github.com")
    XCTAssertNotNil(
      Bundle.module.url(forResource: pack.licenseResource, withExtension: "txt"))
  }

  func testPackLifecycleIsAtomicOfflineAndPreservesLastGoodAfterCorruptUpdate() async throws {
    let temporary = FileManager.default.temporaryDirectory
      .appendingPathComponent("LanguageTechnologyPackTests-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: temporary) }
    let archive = try XCTUnwrap(Data(base64Encoded: Self.fixtureArchiveBase64))
    let catalog = Self.fixtureCatalog
    let validator: @Sendable (URL) throws -> Void = { url in
      guard try Data(contentsOf: url) == Data("validated-test-dictionary".utf8) else {
        throw LanguageTechnologyPackError.goldenOutputMismatch
      }
    }

    let manager = try LanguageTechnologyPackManager(
      catalog: catalog,
      storageDirectory: temporary,
      download: { _ in archive },
      validateProvider: validator
    )
    let initial = await manager.snapshot().packs[0]
    XCTAssertFalse(initial.isInstalled)
    try await manager.download(initial.id)
    let installed = await manager.snapshot().packs[0]
    XCTAssertTrue(installed.isInstalled)
    XCTAssertEqual(installed.installedBytes, 25)

    let offlineRelaunch = try LanguageTechnologyPackManager(
      catalog: catalog,
      storageDirectory: temporary,
      download: { _ in throw URLError(.notConnectedToInternet) },
      validateProvider: validator
    )
    let relaunched = await offlineRelaunch.snapshot().packs[0]
    XCTAssertTrue(relaunched.isInstalled)
    await assertThrowsErrorAsync {
      try await offlineRelaunch.download(installed.id)
    }
    let retained = await offlineRelaunch.snapshot().packs[0]
    XCTAssertTrue(retained.isInstalled)
    XCTAssertNotNil(retained.failureMessage)

    try await offlineRelaunch.remove(installed.id)
    let removed = await offlineRelaunch.snapshot().packs[0]
    XCTAssertFalse(removed.isInstalled)
    let removedRelaunch = try LanguageTechnologyPackManager(
      catalog: catalog,
      storageDirectory: temporary,
      download: { _ in archive },
      validateProvider: validator
    )
    let reloadedAfterRemoval = await removedRelaunch.snapshot().packs[0]
    XCTAssertFalse(reloadedAfterRemoval.isInstalled)
  }

  func testChecksumMismatchNeverReachesProviderValidation() async throws {
    let temporary = FileManager.default.temporaryDirectory
      .appendingPathComponent("LanguageTechnologyPackChecksumTests-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: temporary) }
    let validation = LockedCounter()
    let manager = try LanguageTechnologyPackManager(
      catalog: Self.fixtureCatalog,
      storageDirectory: temporary,
      download: { _ in Data("corrupt".utf8) },
      validateProvider: { _ in validation.increment() }
    )

    await assertThrowsErrorAsync {
      try await manager.download(Self.fixtureCatalog.packs[0].packID)
    }

    XCTAssertEqual(validation.value, 0)
    let snapshot = await manager.snapshot().packs[0]
    XCTAssertFalse(snapshot.isInstalled)
  }

  func testCancellationLeavesNoPackOrFailureAndStopsBeforeValidation() async throws {
    let temporary = FileManager.default.temporaryDirectory
      .appendingPathComponent("LanguageTechnologyPackCancellationTests-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: temporary) }
    let validation = LockedCounter()
    let manager = try LanguageTechnologyPackManager(
      catalog: Self.fixtureCatalog,
      storageDirectory: temporary,
      download: { _ in
        try await Task.sleep(for: .seconds(60))
        return Data()
      },
      validateProvider: { _ in validation.increment() }
    )
    do {
      try await withThrowingTaskGroup(of: Void.self) { group in
        group.addTask { try await manager.download(Self.fixtureManifest.packID) }
        await Task.yield()
        group.cancelAll()
        _ = try await group.next()
      }
      XCTFail("Expected cancellation")
    } catch is CancellationError {
    } catch {
      XCTFail("Expected CancellationError, got \(error)")
    }
    let state = await manager.snapshot().packs[0]
    XCTAssertFalse(state.isInstalled)
    XCTAssertNil(state.failureMessage)
    XCTAssertEqual(validation.value, 0)
  }

  func testCancellationRaisedByFinalProviderValidationCannotCommitThePack() async throws {
    let temporary = FileManager.default.temporaryDirectory
      .appendingPathComponent("LanguageTechnologyPostValidationCancellation-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: temporary) }
    let archive = try XCTUnwrap(Data(base64Encoded: Self.fixtureArchiveBase64))
    let manager = try LanguageTechnologyPackManager(
      catalog: Self.fixtureCatalog,
      storageDirectory: temporary,
      download: { _ in archive },
      validateProvider: { _ in withUnsafeCurrentTask { $0?.cancel() } }
    )

    await assertThrowsErrorAsync {
      try await manager.download(Self.fixtureManifest.packID)
    }

    let state = await manager.snapshot().packs[0]
    XCTAssertFalse(state.isInstalled)
    XCTAssertNil(state.failureMessage)
    let installedURL = await manager.installedDictionaryURL()
    XCTAssertNil(installedURL)
  }

  func testTrustedInstalledVersionOffersAndAtomicallyAppliesCatalogUpdate() async throws {
    let temporary = FileManager.default.temporaryDirectory
      .appendingPathComponent("LanguageTechnologyPackUpdateTests-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: temporary) }
    let archive = try XCTUnwrap(Data(base64Encoded: Self.fixtureArchiveBase64))
    let validator: @Sendable (URL) throws -> Void = { url in
      guard try Data(contentsOf: url) == Data("validated-test-dictionary".utf8) else {
        throw LanguageTechnologyPackError.goldenOutputMismatch
      }
    }
    let original = try LanguageTechnologyPackManager(
      catalog: Self.fixtureCatalog,
      storageDirectory: temporary,
      download: { _ in archive },
      validateProvider: validator
    )
    try await original.download(Self.fixtureManifest.packID)

    let updatedManifest = Self.makeFixtureManifest(version: "2")
    let updatedCatalog = LanguageTechnologyPackCatalog(
      schemaVersion: 1,
      packs: [updatedManifest],
      trustedHistoricalManifests: [Self.fixtureManifest]
    )
    let updater = try LanguageTechnologyPackManager(
      catalog: updatedCatalog,
      storageDirectory: temporary,
      download: { _ in archive },
      validateProvider: validator
    )
    let available = await updater.snapshot().packs[0]
    XCTAssertTrue(available.isInstalled)
    XCTAssertTrue(available.isActive)
    XCTAssertEqual(available.installedVersion, "1")
    XCTAssertTrue(available.updateAvailable)

    try await updater.download(updatedManifest.packID)
    let updated = await updater.snapshot().packs[0]
    XCTAssertTrue(updated.isInstalled)
    XCTAssertTrue(updated.isActive)
    XCTAssertEqual(updated.installedVersion, "2")
    XCTAssertFalse(updated.updateAvailable)
  }

  private static let fixtureArchiveBase64 =
    "UEsDBBQAAAAIACltI13Wpe3BGwAAABkAAAASAAAAZml4dHVyZS9zeXN0ZW0uZGljK0vMyUxJLElN0S1JLS7RTclMLsnMz0ssqgQAUEsBAhQDFAAAAAgAKW0jXdal7cEbAAAAGQAAABIAAAAAAAAAAAAAAIABAAAAAGZpeHR1cmUvc3lzdGVtLmRpY1BLBQYAAAAAAQABAEAAAABLAAAAAAA="

  private static func goldenAnalysis(
    engineVersion: String = SudachiCoreContract.engineVersion,
    dictionarySHA256: String = SudachiCoreContract.dictionarySHA256,
    firstLemma: String = "日本語",
    firstReading: String = "ニホンゴ",
    firstPOS: String = "名詞",
    firstIsOOV: Bool = false
  ) -> JapaneseMorphologyAnalysis {
    let candidates = [
      candidate(
        "日本語", range: 0..<3, lemma: firstLemma, reading: firstReading, pos: firstPOS,
        isOOV: firstIsOOV),
      candidate("を", range: 3..<4, lemma: "を", reading: "ヲ", pos: "助詞"),
      candidate("用いる", range: 4..<7, lemma: "用いる", reading: "モチイル", pos: "動詞"),
      candidate("。", range: 7..<8, lemma: "。", reading: "。", pos: "補助記号"),
    ]
    return JapaneseMorphologyAnalysis(
      transcript: "日本語を用いる。",
      candidates: candidates,
      engine: SudachiCoreContract.engine,
      engineVersion: engineVersion,
      dictionary: SudachiCoreContract.dictionary,
      dictionarySHA256: dictionarySHA256
    )
  }

  private static func candidate(
    _ surface: String,
    range: Range<Int>,
    lemma: String,
    reading: String,
    pos: String,
    isOOV: Bool = false
  ) -> JapaneseMorphologyCandidate {
    let child = JapaneseMorphologyCandidate(
      surface: surface,
      scalarRange: range,
      dictionaryForm: lemma,
      normalizedForm: lemma,
      reading: reading,
      partOfSpeech: [pos],
      isOutOfVocabulary: isOOV,
      children: []
    )
    return JapaneseMorphologyCandidate(
      surface: surface,
      scalarRange: range,
      dictionaryForm: lemma,
      normalizedForm: lemma,
      reading: reading,
      partOfSpeech: [pos],
      isOutOfVocabulary: isOOV,
      children: [child]
    )
  }

  private static let fixtureManifest = makeFixtureManifest(version: "1")

  private static func makeFixtureManifest(version: String) -> LanguageTechnologyPackManifest {
    LanguageTechnologyPackManifest(
      packID: LanguageTechnologyPackID(rawValue: "fixture-core"),
      displayName: "Fixture Japanese Text Analysis",
      packVersion: version,
      engine: "fixture",
      engineVersion: "1",
      binding: "fixture",
      bindingVersion: "1",
      splitPolicy: "fixture",
      downloadURL: URL(string: "https://example.invalid/fixture.whl")!,
      downloadBytes: 161,
      downloadSHA256: "f9c523fa67fd293e217ffe0fd9fad79143c9b8dfccc547749d6eb6ed99e4eae7",
      archiveEntry: "fixture/system.dic",
      installedBytes: 25,
      installedSHA256: "e8ad53d1e472f069c26498851bbc3d95fae45cad392821616180f8a56bbb4bf0",
      runtimeResourceCommit: "fixture",
      characterDefinitionSHA256: "fixture",
      unknownDefinitionSHA256: "fixture",
      licenseIdentifier: "Fixture",
      attribution: "Fixture",
      licenseResource: "SudachiLanguageTechnologyNotices"
    )
  }

  private static let fixtureCatalog = LanguageTechnologyPackCatalog(
    schemaVersion: 1,
    packs: [fixtureManifest],
    trustedHistoricalManifests: []
  )
}

private final class LockedCounter: @unchecked Sendable {
  private let lock = NSLock()
  private var count = 0

  var value: Int { lock.withLock { count } }
  func increment() { lock.withLock { count += 1 } }
}

private func assertThrowsErrorAsync(
  _ expression: () async throws -> Void,
  file: StaticString = #filePath,
  line: UInt = #line
) async {
  do {
    try await expression()
    XCTFail("Expected error", file: file, line: line)
  } catch {}
}
