import CryptoKit
import SQLite3
import XCTest

@testable import SearchExperience

private let tubelexDisclosure = FrequencyPackDisclosure(
  id: FrequencyPackID(rawValue: "zenbu.tubelex.youtube.ja.unidic-3.1"),
  displayName: "TUBELEX YouTube Japanese",
  domain: "YouTube / everyday media Japanese",
  domainDescription:
    "Japanese used in YouTube subtitles across everyday media categories; this is media frequency, not universal Japanese frequency.",
  version: "2025.1",
  attribution: "TUBELEX Japanese frequency lists by Adam Nohejl and contributors"
)

final class FrequencyPackTests: XCTestCase {
  func testFrequencyPackActionLabelsDescribeTheirConsequences() {
    XCTAssertEqual(FrequencyPackAction.download.label, "Download")
    XCTAssertEqual(FrequencyPackAction.activate.label, "Use This Dictionary")
    XCTAssertEqual(FrequencyPackAction.update.label, "Download Update")
    XCTAssertEqual(FrequencyPackAction.remove.label, "Remove Pack")
  }

  func testBundledTUBELEXCapabilityReturnsPinnedSourceEvidence() async throws {
    let capability = try FrequencyCapability.freshBundledTUBELEX()

    let miru = try await capability.evidence(
      for: LanguageReferenceID(rawValue: "7f490a9c9c0da94f4e9474f4efe74be1")
    )
    let butterfly = try await capability.evidence(
      for: LanguageReferenceID(rawValue: "c89bc8d79270f34f8646a9661817fc20")
    )
    let thorn = try await capability.evidence(
      for: LanguageReferenceID(rawValue: "e3e60b5ae69897299cc1ec0b30857201")
    )

    XCTAssertEqual(
      miru,
      .evidence(
        FrequencyEvidence(
          pack: tubelexDisclosure,
          languageReferenceID: LanguageReferenceID(
            rawValue: "7f490a9c9c0da94f4e9474f4efe74be1"),
          rank: 41,
          coveredSourceRows: 351_453,
          sourceCount: 552_294,
          sourceTotalTokens: 165_721_393,
          sourceDocuments: nil,
          sourceVideos: 100_660,
          sourceChannels: 30_550,
          matchedForm: "見る",
          sourcePartOfSpeech: "動詞-非自立可能",
          sourceRecordDigest: "f9f2e152873ba4eb0a02ef59eb7efd9d231fd8da2bf3e3670cf7ce8932e37ac9",
          mappingRelation: .uniqueFormFallback
        )
      )
    )
    XCTAssertEqual(butterfly.evidence?.rank, 11_497)
    XCTAssertEqual(butterfly.evidence?.sourceCount, 501)
    XCTAssertEqual(thorn.evidence?.rank, 14_728)
    XCTAssertEqual(thorn.evidence?.sourceCount, 335)
  }

  func testBundledTUBELEXCapabilityDistinguishesMissingAndAmbiguousEvidence() async throws {
    let capability = try FrequencyCapability.freshBundledTUBELEX()

    let doItama = try await capability.evidence(
      for: LanguageReferenceID(rawValue: "df87bd3681d3cb3d33d2aa1e2987d460")
    )
    let ambiguousIru = try await capability.evidence(
      for: LanguageReferenceID(rawValue: "8647047758cffbea50d72922fad277e0")
    )

    XCTAssertEqual(
      doItama,
      .noEvidence(pack: tubelexDisclosure))
    XCTAssertEqual(
      ambiguousIru,
      .noEvidence(pack: tubelexDisclosure))
  }

  func testNumericPercentileDoesNotInventCommonRareBands() {
    let evidence = FrequencyEvidence(
      pack: FrequencyPackDisclosure(
        id: FrequencyPackID(rawValue: "fixture"),
        displayName: "Fixture",
        domain: "Fixture domain",
        domainDescription: "Fixture description",
        version: "1",
        attribution: "Fixture authors"
      ),
      languageReferenceID: LanguageReferenceID(rawValue: "fixture"),
      rank: 11_497,
      coveredSourceRows: 351_453,
      sourceCount: 501,
      sourceTotalTokens: 165_721_393,
      sourceDocuments: nil,
      sourceVideos: 100_660,
      sourceChannels: 30_550,
      matchedForm: "蝶々",
      sourcePartOfSpeech: "名詞-普通名詞-一般",
      sourceRecordDigest: "fixture-digest",
      mappingRelation: .uniqueFormFallback
    )

    XCTAssertEqual(evidence.topPercentDisplay, "Top 3.27%")
  }

  func testOptionalPackDownloadActivateOfflineRemoveAndRelaunch() async throws {
    let fixture = try FrequencyLifecycleFixture()
    let downloadState = FrequencyDownloadState(data: fixture.optionalSource)
    let manager = try FrequencyPackManager(
      catalog: fixture.catalog,
      bundledArtifactURL: fixture.bundledArtifact,
      languageDataURL: fixture.languageData,
      storageDirectory: fixture.storageDirectory,
      download: { _ in
        try await downloadState.download()
      }
    )

    var snapshot = try await manager.snapshot()
    XCTAssertEqual(snapshot.activePackID, fixture.bundledID)
    let bundledPresentation = FrequencyPresentationModel(
      result: try await manager.evidence(for: fixture.miruID))
    XCTAssertEqual(bundledPresentation.inlineText, "#1")
    XCTAssertEqual(bundledPresentation.pack?.displayName, "Fixture YouTube")
    try await manager.download(fixture.optionalID)
    snapshot = try await manager.snapshot()
    XCTAssertTrue(snapshot.packs[1].isInstalled)
    try await manager.activate(fixture.optionalID)
    snapshot = try await manager.snapshot()
    XCTAssertEqual(snapshot.activePackID, fixture.optionalID)
    XCTAssertEqual(snapshot.packs[1].updateStatus, "Up to date")
    XCTAssertEqual(snapshot.packs[1].availableActions, [.remove])
    var evidence = try await manager.evidence(for: fixture.miruID)
    XCTAssertEqual(evidence.evidence?.rank, 1)
    let optionalPresentation = FrequencyPresentationModel(result: evidence)
    XCTAssertEqual(optionalPresentation.inlineText, "#1")
    XCTAssertEqual(optionalPresentation.pack?.displayName, "Fixture Wikipedia")
    let noMatchPresentation = FrequencyPresentationModel(
      result: try await manager.evidence(
        for: LanguageReferenceID(rawValue: "000000000000000000000000000000ff")))
    XCTAssertEqual(noMatchPresentation.inlineText, "—")
    XCTAssertEqual(
      noMatchPresentation.inlineAccessibilityLabel,
      "The active frequency dictionary has no rank for this entry. Double tap for details."
    )
    let posResolved = try await manager.evidence(
      for: LanguageReferenceID(rawValue: "00000000000000000000000000000005"))
    XCTAssertEqual(posResolved.evidence?.mappingRelation, .exactReadingPOS)
    XCTAssertEqual(posResolved.evidence?.sourcePartOfSpeech, "名詞-普通名詞-一般")
    let writtenPOSResolved = try await manager.evidence(
      for: LanguageReferenceID(rawValue: "00000000000000000000000000000007"))
    XCTAssertEqual(writtenPOSResolved.evidence?.mappingRelation, .exactWrittenPOS)

    await downloadState.setOffline(true)
    evidence = try await manager.evidence(for: fixture.miruID)
    XCTAssertEqual(evidence.evidence?.sourceCount, 80)
    let relaunched = try FrequencyPackManager(
      catalog: fixture.catalog,
      bundledArtifactURL: fixture.bundledArtifact,
      languageDataURL: fixture.languageData,
      storageDirectory: fixture.storageDirectory,
      download: { _ in throw URLError(.notConnectedToInternet) }
    )
    snapshot = try await relaunched.snapshot()
    XCTAssertEqual(snapshot.activePackID, fixture.optionalID)
    try await relaunched.remove(fixture.optionalID)
    snapshot = try await relaunched.snapshot()
    XCTAssertEqual(snapshot.activePackID, fixture.bundledID)
    XCTAssertFalse(snapshot.packs[1].isInstalled)
  }

  func testFailedUpdateRetainsLastValidActivePackAndOffersRetryState() async throws {
    let fixture = try FrequencyLifecycleFixture()
    let downloadState = FrequencyDownloadState(data: fixture.optionalSource)
    let manager = try FrequencyPackManager(
      catalog: fixture.catalog,
      bundledArtifactURL: fixture.bundledArtifact,
      languageDataURL: fixture.languageData,
      storageDirectory: fixture.storageDirectory,
      download: { _ in try await downloadState.download() }
    )
    try await manager.download(fixture.optionalID)
    try await manager.activate(fixture.optionalID)

    await downloadState.setData(Data("corrupt".utf8))
    await xctAssertThrowsErrorAsync {
      try await manager.download(fixture.optionalID)
    }
    let snapshot = try await manager.snapshot()
    XCTAssertEqual(snapshot.activePackID, fixture.optionalID)
    XCTAssertTrue(snapshot.packs[1].isInstalled)
    XCTAssertEqual(snapshot.packs[1].failureMessage, "Downloaded file failed checksum validation.")
    let retainedEvidence = try await manager.evidence(for: fixture.miruID)
    XCTAssertEqual(retainedEvidence.evidence?.sourceCount, 80)
  }

  func testNewCatalogVersionKeepsOldPackActiveUntilOptInUpdateValidates() async throws {
    let fixture = try FrequencyLifecycleFixture()
    let initialDownload = FrequencyDownloadState(data: fixture.optionalSource)
    var manager = try FrequencyPackManager(
      catalog: fixture.catalog,
      bundledArtifactURL: fixture.bundledArtifact,
      languageDataURL: fixture.languageData,
      storageDirectory: fixture.storageDirectory,
      download: { _ in try await initialDownload.download() }
    )
    try await manager.download(fixture.optionalID)
    try await manager.activate(fixture.optionalID)

    let updatedCatalog = try fixture.catalog(updatingOptionalVersionTo: "2")
    let untrustedCatalog = FrequencyPackCatalog(
      schemaVersion: 1,
      packs: updatedCatalog.packs
    )
    let untrustedRelaunch = try FrequencyPackManager(
      catalog: untrustedCatalog,
      bundledArtifactURL: fixture.bundledArtifact,
      languageDataURL: fixture.languageData,
      storageDirectory: fixture.storageDirectory,
      download: { _ in Data() }
    )
    let untrustedSnapshot = try await untrustedRelaunch.snapshot()
    XCTAssertEqual(untrustedSnapshot.activePackID, fixture.bundledID)

    let failedUpdate = FrequencyDownloadState(data: Data("corrupt update".utf8))
    manager = try FrequencyPackManager(
      catalog: updatedCatalog,
      bundledArtifactURL: fixture.bundledArtifact,
      languageDataURL: fixture.languageData,
      storageDirectory: fixture.storageDirectory,
      download: { _ in try await failedUpdate.download() }
    )
    var snapshot = try await manager.snapshot()
    XCTAssertEqual(snapshot.activePackID, fixture.optionalID)
    XCTAssertEqual(snapshot.packs[1].updateStatus, "Update available: 2")
    XCTAssertEqual(snapshot.packs[1].availableActions, [.update, .remove])
    var evidence = try await manager.evidence(for: fixture.miruID)
    XCTAssertEqual(evidence.evidence?.pack.version, "1")

    await xctAssertThrowsErrorAsync { try await manager.download(fixture.optionalID) }
    snapshot = try await manager.snapshot()
    XCTAssertEqual(snapshot.activePackID, fixture.optionalID)
    XCTAssertEqual(snapshot.packs[1].updateStatus, "Update available: 2")
    evidence = try await manager.evidence(for: fixture.miruID)
    XCTAssertEqual(evidence.evidence?.pack.version, "1")
  }

  func testRelaunchRejectsCorruptOptionalArtifactAndFallsBackToIncludedPack() async throws {
    let fixture = try FrequencyLifecycleFixture()
    let optionalSource = fixture.optionalSource
    let manager = try FrequencyPackManager(
      catalog: fixture.catalog,
      bundledArtifactURL: fixture.bundledArtifact,
      languageDataURL: fixture.languageData,
      storageDirectory: fixture.storageDirectory,
      download: { _ in optionalSource }
    )
    try await manager.download(fixture.optionalID)
    try await manager.activate(fixture.optionalID)
    try Data("truncated".utf8).write(
      to: fixture.storageDirectory.appendingPathComponent(
        fixture.optionalID.rawValue + ".sqlite3"),
      options: .atomic
    )

    let relaunched = try FrequencyPackManager(
      catalog: fixture.catalog,
      bundledArtifactURL: fixture.bundledArtifact,
      languageDataURL: fixture.languageData,
      storageDirectory: fixture.storageDirectory,
      download: { _ in optionalSource }
    )
    let snapshot = try await relaunched.snapshot()
    XCTAssertEqual(snapshot.activePackID, fixture.bundledID)
    XCTAssertFalse(snapshot.packs[1].isInstalled)
  }

  func testRelaunchRejectsTamperedWritableManifestIdentity() async throws {
    let fixture = try FrequencyLifecycleFixture()
    let optionalSource = fixture.optionalSource
    let manager = try FrequencyPackManager(
      catalog: fixture.catalog,
      bundledArtifactURL: fixture.bundledArtifact,
      languageDataURL: fixture.languageData,
      storageDirectory: fixture.storageDirectory,
      download: { _ in optionalSource }
    )
    try await manager.download(fixture.optionalID)
    try await manager.activate(fixture.optionalID)

    let stateURL = fixture.storageDirectory.appendingPathComponent("state.json")
    var state = try XCTUnwrap(
      JSONSerialization.jsonObject(with: Data(contentsOf: stateURL)) as? [String: Any])
    var records = try XCTUnwrap(state["installedRecords"] as? [[String: Any]])
    records[0]["manifestSHA256"] = String(repeating: "0", count: 64)
    state["installedRecords"] = records
    try JSONSerialization.data(withJSONObject: state, options: [.sortedKeys]).write(
      to: stateURL, options: .atomic)

    let relaunched = try FrequencyPackManager(
      catalog: fixture.catalog,
      bundledArtifactURL: fixture.bundledArtifact,
      languageDataURL: fixture.languageData,
      storageDirectory: fixture.storageDirectory,
      download: { _ in optionalSource }
    )
    let snapshot = try await relaunched.snapshot()
    XCTAssertEqual(snapshot.activePackID, fixture.bundledID)
    XCTAssertFalse(snapshot.packs[1].isInstalled)
  }

  func testDictionaryRankingOrderIsIsolatedFromPackLifecycle() async throws {
    let fixture = try FrequencyLifecycleFixture()
    let downloadState = FrequencyDownloadState(data: fixture.optionalSource)
    let manager = try FrequencyPackManager(
      catalog: fixture.catalog,
      bundledArtifactURL: fixture.bundledArtifact,
      languageDataURL: fixture.languageData,
      storageDirectory: fixture.storageDirectory,
      download: { _ in try await downloadState.download() }
    )
    let lookup = LookupClient.freshBundledDatabase()
    let baseline = try await rankingIDs(for: ["見る", "蝶々", "茨", "どいたま"], lookup: lookup)
    XCTAssertEqual(
      baseline.compactMap(\.first),
      [
        "7f490a9c9c0da94f4e9474f4efe74be1",
        "c89bc8d79270f34f8646a9661817fc20",
        "e3e60b5ae69897299cc1ec0b30857201",
        "df87bd3681d3cb3d33d2aa1e2987d460",
      ])

    _ = try await manager.evidence(for: fixture.miruID)
    var current = try await rankingIDs(
      for: ["見る", "蝶々", "茨", "どいたま"], lookup: lookup)
    XCTAssertEqual(current, baseline)
    try await manager.download(fixture.optionalID)
    try await manager.activate(fixture.optionalID)
    current = try await rankingIDs(
      for: ["見る", "蝶々", "茨", "どいたま"], lookup: lookup)
    XCTAssertEqual(current, baseline)
    await downloadState.setData(Data("corrupt".utf8))
    await xctAssertThrowsErrorAsync { try await manager.download(fixture.optionalID) }
    current = try await rankingIDs(
      for: ["見る", "蝶々", "茨", "どいたま"], lookup: lookup)
    XCTAssertEqual(current, baseline)
    try await manager.remove(fixture.optionalID)
    current = try await rankingIDs(
      for: ["見る", "蝶々", "茨", "どいたま"], lookup: lookup)
    XCTAssertEqual(current, baseline)
  }

  private func rankingIDs(for queries: [String], lookup: LookupClient) async throws
    -> [[String]]
  {
    try await queries.asyncMap { query in
      let results = try await lookup.search(SearchQuery(query))
      return (results.best + results.additional).map(\.id.rawValue)
    }
  }
}

private actor FrequencyDownloadState {
  private var data: Data
  private var isOffline = false

  init(data: Data) {
    self.data = data
  }

  func setData(_ data: Data) {
    self.data = data
  }

  func setOffline(_ isOffline: Bool) {
    self.isOffline = isOffline
  }

  func download() throws -> Data {
    if isOffline { throw URLError(.notConnectedToInternet) }
    return data
  }
}

extension FrequencyLookupResult {
  fileprivate var evidence: FrequencyEvidence? {
    guard case .evidence(let evidence) = self else { return nil }
    return evidence
  }
}

private struct FrequencyLifecycleFixture {
  let bundledID = FrequencyPackID(rawValue: "fixture.youtube")
  let optionalID = FrequencyPackID(rawValue: "fixture.wikipedia")
  let miruID = LanguageReferenceID(rawValue: "00000000000000000000000000000001")
  let storageDirectory: URL
  let languageData: URL
  let bundledArtifact: URL
  let optionalSource: Data
  let catalog: FrequencyPackCatalog

  init() throws {
    storageDirectory = FileManager.default.temporaryDirectory.appendingPathComponent(
      "frequency-lifecycle-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(
      at: storageDirectory, withIntermediateDirectories: true)
    languageData = storageDirectory.appendingPathComponent("LanguageReferenceData.sqlite3")
    bundledArtifact = storageDirectory.appendingPathComponent("Bundled.sqlite3")
    try Self.createLanguageData(at: languageData)
    let languageDataSHA256 = try Data(contentsOf: languageData).sha256
    let mappingPolicyURL = try XCTUnwrap(
      Bundle.module.url(forResource: "FrequencyPackMappingV1", withExtension: "sql")
    )
    let mappingPolicySHA256 = try Data(contentsOf: mappingPolicyURL).sha256
    try Self.createBundledArtifact(
      at: bundledArtifact,
      languageDataSHA256: languageDataSHA256,
      mappingPolicySHA256: mappingPolicySHA256
    )
    let bundledArtifactSHA256 = try Data(contentsOf: bundledArtifact).sha256
    let sourceText =
      "word\tcount\tdocuments\tpos\n"
      + "見る\t80\t8\t動詞-一般\n"
      + "蝶々\t20\t4\t名詞-普通名詞-一般\n"
      + "いる\t5\t3\t動詞-一般\n"
      + "はし\t10\t2\t名詞-普通名詞-一般\n"
      + "はる\t9\t2\t名詞-普通名詞-一般\n"
      + "未収録\t1\t1\t名詞-普通名詞-一般\n"
      + "[TOTAL]\t100\t10\t\n"
    optionalSource = try (Data(sourceText.utf8) as NSData).compressed(using: .lzma) as Data
    catalog = FrequencyPackCatalog(
      schemaVersion: 1,
      packs: [
        Self.manifest(
          id: bundledID,
          name: "Fixture YouTube",
          source: Data(),
          languageDataSHA256: languageDataSHA256,
          mappingPolicySHA256: mappingPolicySHA256,
          bundledArtifactSHA256: bundledArtifactSHA256,
          bundled: true,
          removable: false
        ),
        Self.manifest(
          id: optionalID,
          name: "Fixture Wikipedia",
          source: optionalSource,
          languageDataSHA256: languageDataSHA256,
          mappingPolicySHA256: mappingPolicySHA256,
          bundledArtifactSHA256: nil,
          bundled: false,
          removable: true
        ),
      ]
    )
  }

  func catalog(updatingOptionalVersionTo version: String) throws -> FrequencyPackCatalog {
    let bundled = catalog.packs[0]
    let data = try JSONEncoder().encode(catalog.packs[1])
    guard var object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      throw FrequencyPackError.invalidCatalog
    }
    object["packVersion"] = version
    let updated = try JSONDecoder().decode(
      FrequencyPackManifest.self,
      from: JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    )
    return FrequencyPackCatalog(
      schemaVersion: 1,
      packs: [bundled, updated],
      trustedHistoricalManifests: [catalog.packs[1]]
    )
  }

  private static func manifest(
    id: FrequencyPackID,
    name: String,
    source: Data,
    languageDataSHA256: String,
    mappingPolicySHA256: String,
    bundledArtifactSHA256: String?,
    bundled: Bool,
    removable: Bool
  ) -> FrequencyPackManifest {
    FrequencyPackManifest(
      packID: id,
      packVersion: "1",
      displayName: name,
      domain: bundled ? "YouTube" : "Written",
      domainDescription: "Fixture domain",
      sourceIdentity: "Fixture source",
      sourceSnapshot: "fixture-1",
      measurement: "fixture count",
      tokenizer: "Fixture tokenizer",
      normalization: "NFKC source forms; canonical app forms",
      rankTiePolicy:
        "One-based source row ordinal after the header; equal counts retain pinned source artifact order and receive distinct ranks.",
      downloadURL: URL(string: "https://example.invalid/\(id.rawValue).xz")!,
      sourceBytes: source.count,
      sourceSHA256: source.sha256,
      sourceTotalTokens: 100,
      coveredSourceRows: 6,
      mappedRows: 4,
      ambiguousRows: 1,
      unmappedRows: 1,
      duplicateMappings: 0,
      mappingSHA256: "ac99e66f7ac01ccaf09de50e64042c02332c8d8887db659ef0b4c3646f1c85a6",
      mappingPolicyVersion: 1,
      mappingPolicySHA256: mappingPolicySHA256,
      offlineImporterSHA256: "fixture-importer",
      runtimeInstallerVersion: 1,
      presentationPolicyVersion: 1,
      presentationCapabilities: ["count", "exactSourceRowRank", "numericTopPercentile"],
      languageDataSHA256: languageDataSHA256,
      bundledArtifactSHA256: bundledArtifactSHA256,
      corpusDocuments: 10,
      corpusVideos: nil,
      corpusChannels: nil,
      licenseIdentifier: "BSD-3-Clause",
      attribution: "Fixture authors",
      licenseURL: URL(string: "https://example.invalid/license")!,
      licenseResource: "fixture",
      bundled: bundled,
      removable: removable
    )
  }

  private static func createLanguageData(at url: URL) throws {
    var database: OpaquePointer?
    XCTAssertEqual(sqlite3_open(url.path, &database), SQLITE_OK)
    guard let database else { throw FrequencyPackError.invalidArtifact }
    defer { sqlite3_close(database) }
    XCTAssertEqual(
      sqlite3_exec(
        database,
        "CREATE TABLE entries(id BLOB PRIMARY KEY, headword TEXT, reading TEXT, parts_of_speech_json TEXT);"
          + "CREATE TABLE forms(entry_id BLOB, form TEXT, kind INTEGER);"
          + "INSERT INTO entries VALUES(X'00000000000000000000000000000001','見る','みる','[\"Ichidan Verb\"]');"
          + "INSERT INTO entries VALUES(X'00000000000000000000000000000002','蝶々','ちょうちょう','[\"Noun\"]');"
          + "INSERT INTO entries VALUES(X'00000000000000000000000000000003','居る','いる','[\"Ichidan Verb\"]');"
          + "INSERT INTO entries VALUES(X'00000000000000000000000000000004','要る','いる','[\"Godan Verb\"]');"
          + "INSERT INTO entries VALUES(X'00000000000000000000000000000005','橋','はし','[\"Noun\"]');"
          + "INSERT INTO entries VALUES(X'00000000000000000000000000000006','走る','はし','[\"Godan Verb\"]');"
          + "INSERT INTO entries VALUES(X'00000000000000000000000000000007','はる','はる-noun','[\"Noun\"]');"
          + "INSERT INTO entries VALUES(X'00000000000000000000000000000008','はる','はる-verb','[\"Godan Verb\"]');"
          + "INSERT INTO forms SELECT id, headword, 0 FROM entries;"
          + "INSERT INTO forms SELECT id, reading, 1 FROM entries;",
        nil,
        nil,
        nil
      ),
      SQLITE_OK
    )
  }

  private static func createBundledArtifact(
    at url: URL,
    languageDataSHA256: String,
    mappingPolicySHA256: String
  ) throws {
    var database: OpaquePointer?
    XCTAssertEqual(sqlite3_open(url.path, &database), SQLITE_OK)
    guard let database else { throw FrequencyPackError.invalidArtifact }
    defer { sqlite3_close(database) }
    XCTAssertEqual(
      sqlite3_exec(
        database,
        "CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT);"
          + "CREATE TABLE frequency_evidence(language_reference_id BLOB PRIMARY KEY, rank INTEGER, source_count INTEGER, covered_source_rows INTEGER, mapping_relation TEXT, matched_form TEXT, source_pos TEXT, source_record_digest BLOB);"
          + "INSERT INTO metadata VALUES('artifact_schema','zenbu.frequency-pack.v1');"
          + "INSERT INTO metadata VALUES('pack_id','fixture.youtube');"
          + "INSERT INTO metadata VALUES('pack_version','1');"
          + "INSERT INTO metadata VALUES('mapped_rows','4');"
          + "INSERT INTO metadata VALUES('ambiguous_rows','1');"
          + "INSERT INTO metadata VALUES('unmapped_rows','1');"
          + "INSERT INTO metadata VALUES('duplicate_mappings','0');"
          + "INSERT INTO metadata VALUES('mapping_sha256','ac99e66f7ac01ccaf09de50e64042c02332c8d8887db659ef0b4c3646f1c85a6');"
          + "INSERT INTO metadata VALUES('mapping_policy_version','1');"
          + "INSERT INTO metadata VALUES('mapping_policy_sha256','\(mappingPolicySHA256)');"
          + "INSERT INTO metadata VALUES('presentation_policy_version','1');"
          + "INSERT INTO metadata VALUES('language_data_sha256','\(languageDataSHA256)');"
          + "INSERT INTO metadata VALUES('source_total_tokens','100');"
          + "INSERT INTO metadata VALUES('covered_source_rows','6');"
          + "INSERT INTO frequency_evidence VALUES(X'00000000000000000000000000000001',1,80,6,'uniqueFormFallback','見る','動詞-一般',X'b3dff35692b6c12e52a78ceaba68c25e3a5467dce7e9376fd6c8026d05dd8766');"
          + "INSERT INTO frequency_evidence VALUES(X'00000000000000000000000000000002',2,20,6,'uniqueFormFallback','蝶々','名詞-普通名詞-一般',X'7feb5d02613ded3d9e487fed688700d859493368a4ec259e5ef00ea975e784d8');"
          + "INSERT INTO frequency_evidence VALUES(X'00000000000000000000000000000005',4,10,6,'exactReadingPOS','はし','名詞-普通名詞-一般',X'b59828f10526bc41384bba38f7ef6c26fdf7afca519274165c2a433282414e03');"
          + "INSERT INTO frequency_evidence VALUES(X'00000000000000000000000000000007',5,9,6,'exactWrittenPOS','はる','名詞-普通名詞-一般',X'25b57830d56df9407e3aaa100694f64c8748636ca92d663e240b73d6f9fc2611');",
        nil,
        nil,
        nil
      ),
      SQLITE_OK
    )
  }
}

extension Data {
  fileprivate var sha256: String {
    SHA256.hash(data: self).map { String(format: "%02x", $0) }.joined()
  }
}

private func xctAssertThrowsErrorAsync(
  _ expression: () async throws -> Void,
  file: StaticString = #filePath,
  line: UInt = #line
) async {
  do {
    try await expression()
    XCTFail("Expected error", file: file, line: line)
  } catch {}
}

extension Array {
  fileprivate func asyncMap<Value>(_ transform: (Element) async throws -> Value) async rethrows
    -> [Value]
  {
    var values: [Value] = []
    for element in self {
      let value = try await transform(element)
      values.append(value)
    }
    return values
  }
}
