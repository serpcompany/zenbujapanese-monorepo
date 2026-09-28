import CryptoKit
import Foundation
import SQLite3

/// One lookup result per enabled frequency dictionary, in the learner's priority order. Search
/// orders by the first result, then each next one breaks ties; an empty list means no dictionary
/// is enabled.
typealias FrequencyRanks = [FrequencyLookupResult]

struct FrequencyCapability: Sendable {
  private let batchLookup:
    @Sendable ([LanguageReferenceID]) async throws -> [LanguageReferenceID: FrequencyRanks]

  init(
    batchLookup:
      @escaping @Sendable ([LanguageReferenceID]) async throws
      -> [LanguageReferenceID: FrequencyRanks]
  ) {
    self.batchLookup = batchLookup
  }

  func evidence(for id: LanguageReferenceID) async throws -> FrequencyRanks {
    guard let result = try await batchLookup([id])[id] else {
      throw FrequencyPackError.invalidArtifact
    }
    return result
  }

  func evidence(for ids: [LanguageReferenceID]) async throws
    -> [LanguageReferenceID: FrequencyRanks]
  {
    let results = try await batchLookup(ids)
    guard ids.allSatisfy({ results[$0] != nil }) else {
      throw FrequencyPackError.invalidArtifact
    }
    return results
  }

  static let live = FrequencyCapability(batchLookup: { ids in
    try await FrequencyPackStore.shared.evidence(for: ids)
  })

  static func freshBundledTUBELEX() throws -> FrequencyCapability {
    guard
      let url = Bundle.module.url(
        forResource: "TUBELEXFrequencyPack", withExtension: "sqlite3")
    else {
      throw FrequencyPackError.missingBundledPack
    }
    let catalog = try FrequencyPackCatalog.bundled()
    guard
      let manifest = catalog.packs.first(where: {
        $0.bundled && $0.bundledResource == "TUBELEXFrequencyPack"
      })
    else {
      throw FrequencyPackError.invalidCatalog
    }
    let artifact = try FrequencyPackArtifact(url: url, manifest: manifest)
    try artifact.validateSmokeTest()
    return FrequencyCapability(batchLookup: { ids in
      try artifact.evidence(for: ids).mapValues { [$0] }
    })
  }
}

struct FrequencyPackClient: Sendable {
  var snapshot: @Sendable () async throws -> FrequencyPackSnapshot
  var download: @Sendable (FrequencyPackID) async throws -> Void
  var enable: @Sendable (FrequencyPackID) async throws -> Void
  var disable: @Sendable (FrequencyPackID) async throws -> Void
  var reorderEnabled: @Sendable ([FrequencyPackID]) async throws -> Void
  var remove: @Sendable (FrequencyPackID) async throws -> Void

  static let live = FrequencyPackClient(
    snapshot: { try await FrequencyPackStore.shared.snapshot() },
    download: { try await FrequencyPackStore.shared.download($0) },
    enable: { try await FrequencyPackStore.shared.enable($0) },
    disable: { try await FrequencyPackStore.shared.disable($0) },
    reorderEnabled: { try await FrequencyPackStore.shared.reorderEnabled($0) },
    remove: { try await FrequencyPackStore.shared.remove($0) }
  )
}

enum FrequencyLookupResult: Equatable, Sendable {
  case evidence(FrequencyEvidence)
  case level(FrequencyLevelEvidence)
  case noEvidence(pack: FrequencyPackDisclosure)
  case unavailable(FrequencyPackUnavailable)

  /// Whether the dictionary has a rank or level for the entry.
  var hasEvidence: Bool { sortValue != nil }

  /// Smaller values sort first: a rank, or a level ordered from N5 to N1.
  var sortValue: Int? {
    switch self {
    case .evidence(let evidence): evidence.rank
    case .level(let evidence): evidence.level.sortValue
    case .noEvidence, .unavailable: nil
    }
  }

  static func unavailableResults(
    for ids: [LanguageReferenceID],
    pack: FrequencyPackDisclosure?,
    reason: String
  ) -> [LanguageReferenceID: FrequencyLookupResult] {
    var results: [LanguageReferenceID: FrequencyLookupResult] = [:]
    for id in ids {
      results[id] = .unavailable(FrequencyPackUnavailable(pack: pack, reason: reason))
    }
    return results
  }
}

struct FrequencyPackUnavailable: Equatable, Sendable {
  let pack: FrequencyPackDisclosure?
  let reason: String
}

struct FrequencyEvidence: Equatable, Sendable {
  let pack: FrequencyPackDisclosure
  let languageReferenceID: LanguageReferenceID
  let rank: Int
  let coveredSourceRows: Int
  let sourceCount: Int
  let sourceTotalTokens: Int
  let sourceDocuments: Int?
  let sourceVideos: Int?
  let sourceChannels: Int?
  let matchedForm: String
  let sourcePartOfSpeech: String?
  let sourceRecordDigest: String
  let mappingRelation: MappingRelation

  enum MappingRelation: String, Equatable, Sendable {
    case exactWrittenReading
    case exactReading
    case exactReadingPOS
    case exactWrittenPOS
    case uniqueFormFallback
  }

  var topPercentDisplay: String {
    let percent = Double(rank) / Double(coveredSourceRows) * 100
    return "Top \(String(format: "%.2f", locale: Locale(identifier: "en_US_POSIX"), percent))%"
  }
}

/// A JLPT level; the raw value is the level number, so N5 (the easiest) is 5.
enum JLPTLevel: Int, CaseIterable, Sendable {
  case n1 = 1
  case n2
  case n3
  case n4
  case n5

  var label: String { "N\(rawValue)" }

  /// Learners study from N5 up, so N5 sorts first.
  var sortValue: Int { 6 - rawValue }
}

struct FrequencyLevelEvidence: Equatable, Sendable {
  let pack: FrequencyPackDisclosure
  let languageReferenceID: LanguageReferenceID
  let level: JLPTLevel

  static let explanation =
    "JLPT levels are study estimates from Jonathan Waller's vocabulary lists. JLPT has "
    + "published no official vocabulary list since 2010."
}

/// How common a ranked word is, using Migaku's star cutoffs so learners who know that scale
/// read Zenbu's chips the same way.
enum FrequencyTier: Int, Comparable, Sendable {
  case rare = 1
  case uncommon
  case moderate
  case common
  case veryCommon

  init(rank: Int) {
    switch rank {
    case ...1_500: self = .veryCommon
    case ...5_000: self = .common
    case ...15_000: self = .moderate
    case ...30_000: self = .uncommon
    default: self = .rare
    }
  }

  var label: String {
    switch self {
    case .veryCommon: "very common"
    case .common: "common"
    case .moderate: "moderately common"
    case .uncommon: "uncommon"
    case .rare: "rare"
    }
  }

  /// JLPT levels on the same scale: N5 and N4 read as very common, N3 and N2 as common, and
  /// N1 as moderately common.
  init(level: JLPTLevel) {
    switch level {
    case .n5, .n4: self = .veryCommon
    case .n3, .n2: self = .common
    case .n1: self = .moderate
    }
  }

  static func < (lhs: Self, rhs: Self) -> Bool { lhs.rawValue < rhs.rawValue }
}

struct FrequencyPresentationModel: Equatable, Sendable {
  let result: FrequencyLookupResult
  let packName: String
  /// Nil when the dictionary has no rank for the entry.
  let tier: FrequencyTier?
  let inlineText: String
  let inlineAccessibilityLabel: String
  let pack: FrequencyPackDisclosure?
  let rankText: String?
  let percentileText: String?
  let levelText: String?
  let explanation: String?
  /// Row text when the dictionary has nothing for the entry.
  let missingText: String

  init(result: FrequencyLookupResult) {
    self.result = result
    switch result {
    case .evidence(let evidence):
      let formattedRank = evidence.rank.formatted(.number.locale(Locale(identifier: "en_US")))
      packName = evidence.pack.shortName
      tier = FrequencyTier(rank: evidence.rank)
      inlineText = formattedRank
      inlineAccessibilityLabel =
        "\(evidence.pack.shortName) frequency rank \(evidence.rank), "
        + "\(FrequencyTier(rank: evidence.rank).label). Double tap for details."
      pack = evidence.pack
      rankText = "#\(formattedRank)"
      percentileText = evidence.topPercentDisplay
      levelText = nil
      explanation = nil
      missingText = "No rank"
    case .level(let evidence):
      packName = evidence.pack.shortName
      tier = FrequencyTier(level: evidence.level)
      inlineText = evidence.level.label
      inlineAccessibilityLabel =
        "\(evidence.pack.shortName) level \(evidence.level.label). Double tap for details."
      pack = evidence.pack
      rankText = nil
      percentileText = nil
      levelText = evidence.level.label
      explanation = FrequencyLevelEvidence.explanation
      missingText = "Not listed"
    case .noEvidence(let pack):
      packName = pack.shortName
      tier = nil
      inlineText = "—"
      self.pack = pack
      rankText = nil
      percentileText = nil
      levelText = nil
      switch pack.kind {
      case .rank:
        inlineAccessibilityLabel =
          "\(pack.shortName) has no rank for this entry. Double tap for details."
        explanation = "\(pack.displayName) has no mapped frequency rank for this entry."
        missingText = "No rank"
      case .level:
        inlineAccessibilityLabel =
          "\(pack.shortName) does not list this entry. Double tap for details."
        explanation =
          "\(pack.displayName) does not list this entry. \(FrequencyLevelEvidence.explanation)"
        missingText = "Not listed"
      }
    case .unavailable(let unavailable):
      packName = unavailable.pack?.shortName ?? "Frequency"
      tier = nil
      inlineText = "—"
      inlineAccessibilityLabel = "\(packName) rank unavailable. Double tap for details."
      pack = unavailable.pack
      rankText = nil
      percentileText = nil
      levelText = nil
      explanation = unavailable.reason
      missingText = "Unavailable"
    }
  }
}

struct SearchFrequencyRankPresentationModel: Equatable, Sendable {
  /// Chips in priority order: the first enabled dictionary always, because it orders the
  /// results, then each other dictionary that ranks the entry. A level dictionary such as JLPT
  /// is left out when it does not list the entry, even when first. Empty while evidence loads
  /// or when no dictionary is enabled.
  let chips: [FrequencyPresentationModel]
  let accessibilityValue: String

  init(ranks: FrequencyRanks?) {
    guard let ranks, !ranks.isEmpty else {
      chips = []
      accessibilityValue =
        ranks == nil ? "Frequency rank loading" : "No frequency dictionary enabled"
      return
    }
    let shown = ranks.enumerated().filter { offset, result in
      if result.hasEvidence { return true }
      if case .noEvidence(let pack) = result, pack.kind == .level { return false }
      return offset == 0
    }.map(\.element)
    guard !shown.isEmpty else {
      chips = []
      accessibilityValue = "No frequency rank"
      return
    }
    chips = shown.map(FrequencyPresentationModel.init(result:))
    accessibilityValue = zip(shown, chips).map { result, chip in
      switch result {
      case .evidence(let evidence):
        "\(chip.packName) frequency rank \(evidence.rank), \(chip.tier?.label ?? "")"
      case .level(let evidence): "\(chip.packName) level \(evidence.level.label)"
      case .noEvidence: "\(chip.packName) has no rank for this entry"
      case .unavailable: "\(chip.packName) rank unavailable"
      }
    }.joined(separator: ", ")
  }

  /// The first `limit` chips and how many were left out, for layouts with too little room to
  /// show every dictionary (such as accessibility text sizes). VoiceOver still reads all ranks.
  func collapsed(to limit: Int) -> (chips: [FrequencyPresentationModel], hiddenCount: Int) {
    (Array(chips.prefix(limit)), max(chips.count - limit, 0))
  }
}

enum FrequencyPackError: Error, Equatable {
  case missingBundledPack
  case invalidCatalog
  case invalidPack
  case invalidSource
  case invalidArtifact
  case checksumMismatch
  case mappingMismatch
  case packNotInstalled
  case packNotRemovable
  case sqlite(String)
}

enum FrequencyPackArtifactContent {
  /// V1 hashes its UTF-8 domain separator, then key-sorted metadata. Every UTF-8 key
  /// and value has an unsigned 64-bit big-endian byte-length prefix. `mapping_sha256`
  /// transitively covers every ordered evidence row, so SQLite page layout is excluded.
  static func sha256(metadata: [String: String]) -> String {
    var digest = SHA256()
    digest.update(data: Data("zenbu.frequency-pack-content.v1\0".utf8))
    for (key, value) in metadata.sorted(by: { $0.key < $1.key }) {
      update(key, digest: &digest)
      update(value, digest: &digest)
    }
    return digest.finalize().hexString
  }

  static func mappingSHA256(_ database: OpaquePointer) throws -> String {
    var statement: OpaquePointer?
    guard
      sqlite3_prepare_v2(
        database,
        "SELECT language_reference_id,rank,source_count,matched_form,mapping_relation,source_pos,source_record_digest FROM frequency_evidence ORDER BY language_reference_id",
        -1,
        &statement,
        nil
      ) == SQLITE_OK, let statement
    else { throw sqliteError(database) }
    defer { sqlite3_finalize(statement) }
    var digest = SHA256()
    while sqlite3_step(statement) == SQLITE_ROW {
      guard let identifier = sqlite3_column_blob(statement, 0) else {
        throw FrequencyPackError.invalidArtifact
      }
      digest.update(
        data: Data(bytes: identifier, count: Int(sqlite3_column_bytes(statement, 0))))
      var rank = UInt64(sqlite3_column_int64(statement, 1)).bigEndian
      var count = UInt64(sqlite3_column_int64(statement, 2)).bigEndian
      digest.update(data: Data(bytes: &rank, count: MemoryLayout<UInt64>.size))
      digest.update(data: Data(bytes: &count, count: MemoryLayout<UInt64>.size))
      for column in Int32(3)...Int32(5) {
        guard let value = sqlite3_column_text(statement, column) else {
          throw FrequencyPackError.invalidArtifact
        }
        digest.update(data: Data(String(cString: value).utf8))
        digest.update(data: Data([0]))
      }
      guard let sourceDigest = sqlite3_column_blob(statement, 6) else {
        throw FrequencyPackError.invalidArtifact
      }
      digest.update(
        data: Data(bytes: sourceDigest, count: Int(sqlite3_column_bytes(statement, 6))))
    }
    return digest.finalize().hexString
  }

  /// Every (ID, level) row in ID order: the 16 ID bytes, then the level as an unsigned 64-bit
  /// big-endian integer.
  static func levelMappingSHA256(_ database: OpaquePointer) throws -> String {
    var statement: OpaquePointer?
    guard
      sqlite3_prepare_v2(
        database,
        "SELECT language_reference_id, level FROM level_evidence ORDER BY language_reference_id",
        -1,
        &statement,
        nil
      ) == SQLITE_OK, let statement
    else { throw sqliteError(database) }
    defer { sqlite3_finalize(statement) }
    var digest = SHA256()
    while sqlite3_step(statement) == SQLITE_ROW {
      guard let identifier = sqlite3_column_blob(statement, 0) else {
        throw FrequencyPackError.invalidArtifact
      }
      digest.update(
        data: Data(bytes: identifier, count: Int(sqlite3_column_bytes(statement, 0))))
      var level = UInt64(sqlite3_column_int64(statement, 1)).bigEndian
      digest.update(data: Data(bytes: &level, count: MemoryLayout<UInt64>.size))
    }
    return digest.finalize().hexString
  }

  private static func update(_ value: String, digest: inout SHA256) {
    let data = Data(value.utf8)
    var count = UInt64(data.count).bigEndian
    digest.update(data: Data(bytes: &count, count: MemoryLayout<UInt64>.size))
    digest.update(data: data)
  }

  private static func sqliteError(_ database: OpaquePointer) -> FrequencyPackError {
    .sqlite(String(cString: sqlite3_errmsg(database)))
  }
}

struct FrequencyPackArtifact: Sendable {
  let url: URL

  init(url: URL, manifest: FrequencyPackManifest) throws {
    self.url = url
    var database: OpaquePointer?
    guard sqlite3_open_v2(url.path, &database, SQLITE_OPEN_READONLY, nil) == SQLITE_OK,
      let database
    else {
      if let database { sqlite3_close(database) }
      throw FrequencyPackError.invalidArtifact
    }
    defer { sqlite3_close(database) }
    let metadata = try Self.metadata(database)
    switch manifest.packKind {
    case .rank: try Self.validateRankArtifact(database, metadata: metadata, manifest: manifest)
    case .level: try Self.validateLevelArtifact(database, metadata: metadata, manifest: manifest)
    }
    guard FrequencyPackArtifactContent.sha256(metadata: metadata) == manifest.artifactContentSHA256
    else { throw FrequencyPackError.invalidArtifact }
    self.manifest = manifest
  }

  private static func metadata(_ database: OpaquePointer) throws -> [String: String] {
    var statement: OpaquePointer?
    guard
      sqlite3_prepare_v2(
        database,
        "SELECT key, value FROM metadata ORDER BY key",
        -1,
        &statement,
        nil
      ) == SQLITE_OK,
      let statement
    else {
      throw FrequencyPackError.invalidArtifact
    }
    defer { sqlite3_finalize(statement) }
    var metadata: [String: String] = [:]
    while sqlite3_step(statement) == SQLITE_ROW {
      metadata[sqliteText(statement, 0)] = sqliteText(statement, 1)
    }
    return metadata
  }

  private static func validateRankArtifact(
    _ database: OpaquePointer, metadata: [String: String], manifest: FrequencyPackManifest
  ) throws {
    guard
      try Self.integer(
        database,
        sql: "SELECT count(*) FROM frequency_evidence"
      ) == manifest.mappedRows,
      try Self.integer(
        database,
        sql: "SELECT count(*) FROM frequency_evidence "
          + "WHERE length(language_reference_id) != 16 OR length(source_record_digest) != 32 "
          + "OR rank < 1 OR rank > covered_source_rows "
          + "OR covered_source_rows != \(manifest.coveredSourceRows)"
      ) == 0,
      try Self.text(database, sql: "PRAGMA integrity_check") == "ok",
      try FrequencyPackArtifactContent.mappingSHA256(database) == manifest.mappingSHA256,
      metadata["artifact_schema"] == "zenbu.frequency-pack.v1",
      metadata["pack_id"] == manifest.packID.rawValue,
      metadata["pack_version"] == manifest.packVersion,
      metadata["mapped_rows"] == String(manifest.mappedRows),
      metadata["ambiguous_rows"] == String(manifest.ambiguousRows),
      metadata["unmapped_rows"] == String(manifest.unmappedRows),
      metadata["duplicate_mappings"] == String(manifest.duplicateMappings),
      metadata["mapping_sha256"] == manifest.mappingSHA256,
      metadata["mapping_policy_version"] == String(manifest.mappingPolicyVersion),
      metadata["mapping_policy_sha256"] == manifest.mappingPolicySHA256,
      metadata["presentation_policy_version"] == String(manifest.presentationPolicyVersion),
      metadata["language_data_sha256"] == manifest.languageDataSHA256,
      metadata["source_total_tokens"] == String(manifest.sourceTotalTokens),
      metadata["covered_source_rows"] == String(manifest.coveredSourceRows)
    else {
      throw FrequencyPackError.invalidArtifact
    }
  }

  private static func validateLevelArtifact(
    _ database: OpaquePointer, metadata: [String: String], manifest: FrequencyPackManifest
  ) throws {
    guard
      try Self.integer(database, sql: "SELECT count(*) FROM level_evidence")
        == manifest.mappedRows,
      try Self.integer(
        database,
        sql: "SELECT count(*) FROM level_evidence "
          + "WHERE length(language_reference_id) != 16 OR level NOT BETWEEN 1 AND 5"
      ) == 0,
      try Self.text(database, sql: "PRAGMA integrity_check") == "ok",
      try FrequencyPackArtifactContent.levelMappingSHA256(database) == manifest.mappingSHA256,
      metadata["artifact_schema"] == "zenbu.level-pack.v1",
      metadata["pack_id"] == manifest.packID.rawValue,
      metadata["pack_version"] == manifest.packVersion,
      metadata["source_rows"] == String(manifest.coveredSourceRows),
      metadata["mapped_rows"] == String(manifest.mappedRows),
      metadata["unmapped_rows"] == String(manifest.unmappedRows),
      metadata["duplicate_mappings"] == String(manifest.duplicateMappings),
      metadata["mapping_sha256"] == manifest.mappingSHA256,
      metadata["language_data_sha256"] == manifest.languageDataSHA256,
      metadata["offline_importer_sha256"] == manifest.offlineImporterSHA256
    else {
      throw FrequencyPackError.invalidArtifact
    }
  }

  func evidence(for id: LanguageReferenceID) throws -> FrequencyLookupResult {
    guard let result = try evidence(for: [id])[id] else {
      throw FrequencyPackError.invalidArtifact
    }
    return result
  }

  func validateSmokeTest() throws {
    let smokeTest = manifest.smokeTest
    let languageReferenceID = LanguageReferenceID(rawValue: smokeTest.languageReferenceID)
    switch try evidence(for: languageReferenceID) {
    case .evidence(let evidence)
    where evidence.rank == smokeTest.rank && evidence.pack.id == manifest.packID:
      return
    case .level(let evidence)
    where evidence.level.rawValue == smokeTest.rank && evidence.pack.id == manifest.packID:
      return
    default:
      throw FrequencyPackError.invalidArtifact
    }
  }

  func evidence(for ids: [LanguageReferenceID]) throws
    -> [LanguageReferenceID: FrequencyLookupResult]
  {
    guard !ids.isEmpty else { return [:] }
    var database: OpaquePointer?
    guard sqlite3_open_v2(url.path, &database, SQLITE_OPEN_READONLY, nil) == SQLITE_OK,
      let database
    else {
      if let database { sqlite3_close(database) }
      return FrequencyLookupResult.unavailableResults(
        for: ids, pack: manifest.disclosure, reason: "Pack unavailable")
    }
    defer { sqlite3_close(database) }
    if manifest.packKind == .level {
      return try levelEvidence(for: ids, in: database)
    }
    var statement: OpaquePointer?
    guard
      sqlite3_prepare_v2(
        database,
        "SELECT rank, source_count, covered_source_rows, mapping_relation, matched_form, "
          + "source_pos, lower(hex(source_record_digest)) "
          + "FROM frequency_evidence WHERE language_reference_id = ?",
        -1,
        &statement,
        nil
      ) == SQLITE_OK,
      let statement
    else {
      throw FrequencyPackError.sqlite(String(cString: sqlite3_errmsg(database)))
    }
    defer { sqlite3_finalize(statement) }
    var results: [LanguageReferenceID: FrequencyLookupResult] = [:]
    for id in ids {
      sqlite3_reset(statement)
      sqlite3_clear_bindings(statement)
      // Bind the raw 16-byte key so SQLite can use the primary key instead of scanning.
      guard let key = id.bytes else {
        results[id] = .noEvidence(pack: manifest.disclosure)
        continue
      }
      sqliteBind(key, at: 1, to: statement)
      switch sqlite3_step(statement) {
      case SQLITE_DONE:
        results[id] = .noEvidence(pack: manifest.disclosure)
      case SQLITE_ROW:
        guard
          let relation = FrequencyEvidence.MappingRelation(
            rawValue: sqliteText(statement, 3))
        else {
          throw FrequencyPackError.invalidArtifact
        }
        results[id] = .evidence(
          FrequencyEvidence(
            pack: manifest.disclosure,
            languageReferenceID: id,
            rank: Int(sqlite3_column_int64(statement, 0)),
            coveredSourceRows: Int(sqlite3_column_int64(statement, 2)),
            sourceCount: Int(sqlite3_column_int64(statement, 1)),
            sourceTotalTokens: manifest.sourceTotalTokens,
            sourceDocuments: manifest.corpusDocuments,
            sourceVideos: manifest.corpusVideos,
            sourceChannels: manifest.corpusChannels,
            matchedForm: sqliteText(statement, 4),
            sourcePartOfSpeech: sqliteText(statement, 5).nilIfEmpty,
            sourceRecordDigest: sqliteText(statement, 6),
            mappingRelation: relation
          )
        )
      default:
        throw FrequencyPackError.sqlite(String(cString: sqlite3_errmsg(database)))
      }
    }
    return results
  }

  private func levelEvidence(for ids: [LanguageReferenceID], in database: OpaquePointer) throws
    -> [LanguageReferenceID: FrequencyLookupResult]
  {
    var statement: OpaquePointer?
    guard
      sqlite3_prepare_v2(
        database,
        "SELECT level FROM level_evidence WHERE language_reference_id = ?",
        -1,
        &statement,
        nil
      ) == SQLITE_OK,
      let statement
    else {
      throw FrequencyPackError.sqlite(String(cString: sqlite3_errmsg(database)))
    }
    defer { sqlite3_finalize(statement) }
    var results: [LanguageReferenceID: FrequencyLookupResult] = [:]
    for id in ids {
      sqlite3_reset(statement)
      sqlite3_clear_bindings(statement)
      guard let key = id.bytes else {
        results[id] = .noEvidence(pack: manifest.disclosure)
        continue
      }
      sqliteBind(key, at: 1, to: statement)
      switch sqlite3_step(statement) {
      case SQLITE_DONE:
        results[id] = .noEvidence(pack: manifest.disclosure)
      case SQLITE_ROW:
        guard let level = JLPTLevel(rawValue: Int(sqlite3_column_int64(statement, 0))) else {
          throw FrequencyPackError.invalidArtifact
        }
        results[id] = .level(
          FrequencyLevelEvidence(pack: manifest.disclosure, languageReferenceID: id, level: level))
      default:
        throw FrequencyPackError.sqlite(String(cString: sqlite3_errmsg(database)))
      }
    }
    return results
  }

  private static func integer(_ database: OpaquePointer, sql: String) throws -> Int {
    var statement: OpaquePointer?
    guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK,
      let statement, sqlite3_step(statement) == SQLITE_ROW
    else { throw FrequencyPackError.invalidArtifact }
    defer { sqlite3_finalize(statement) }
    return Int(sqlite3_column_int64(statement, 0))
  }

  private static func text(_ database: OpaquePointer, sql: String) throws -> String {
    var statement: OpaquePointer?
    guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK,
      let statement, sqlite3_step(statement) == SQLITE_ROW
    else { throw FrequencyPackError.invalidArtifact }
    defer { sqlite3_finalize(statement) }
    return sqliteText(statement, 0)
  }

  let manifest: FrequencyPackManifest
}

extension String {
  fileprivate var nilIfEmpty: String? { isEmpty ? nil : self }
}

private actor FrequencyPackStore {
  static let shared = FrequencyPackStore()
  private let manager: FrequencyPackManager?

  init() {
    guard
      let languageDataURL = Bundle.languageReferenceDataURL,
      let catalog = try? FrequencyPackCatalog.bundled(),
      let bundledArtifactURLs = try? catalog.bundledArtifactURLs(),
      let support = FileManager.default.urls(
        for: .applicationSupportDirectory, in: .userDomainMask
      ).first
    else {
      manager = nil
      return
    }
    let storageDirectory = support.appendingPathComponent("FrequencyPacks", isDirectory: true)
    manager = try? FrequencyPackManager(
      catalog: catalog,
      bundledArtifactURLs: bundledArtifactURLs,
      languageDataURL: languageDataURL,
      storageDirectory: storageDirectory,
      download: { url in
        let (data, response) = try await URLSession.shared.data(from: url)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
          throw FrequencyPackError.invalidSource
        }
        return data
      }
    )
  }

  func evidence(for ids: [LanguageReferenceID]) async throws
    -> [LanguageReferenceID: FrequencyRanks]
  {
    guard let manager else {
      return FrequencyLookupResult.unavailableResults(
        for: ids, pack: nil, reason: "Bundled frequency data unavailable"
      ).mapValues { [$0] }
    }
    return try await manager.evidence(for: ids)
  }

  func snapshot() async throws -> FrequencyPackSnapshot {
    guard let manager else { throw FrequencyPackError.invalidCatalog }
    return try await manager.snapshot()
  }

  func download(_ packID: FrequencyPackID) async throws {
    guard let manager else { throw FrequencyPackError.invalidCatalog }
    try await manager.download(packID)
  }

  func enable(_ packID: FrequencyPackID) async throws {
    guard let manager else { throw FrequencyPackError.invalidCatalog }
    try await manager.enable(packID)
  }

  func disable(_ packID: FrequencyPackID) async throws {
    guard let manager else { throw FrequencyPackError.invalidCatalog }
    try await manager.disable(packID)
  }

  func reorderEnabled(_ packIDs: [FrequencyPackID]) async throws {
    guard let manager else { throw FrequencyPackError.invalidCatalog }
    try await manager.reorderEnabled(packIDs)
  }

  func remove(_ packID: FrequencyPackID) async throws {
    guard let manager else { throw FrequencyPackError.invalidCatalog }
    try await manager.remove(packID)
  }
}
