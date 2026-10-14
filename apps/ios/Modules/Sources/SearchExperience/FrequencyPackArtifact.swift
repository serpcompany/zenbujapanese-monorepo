import CryptoKit
import Foundation
import SQLite3

enum FrequencyPackArtifactContent {
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
    try evidenceDigest(
      database,
      sql: "SELECT language_reference_id,rank,source_count,matched_form,mapping_relation,source_pos,source_record_digest FROM frequency_evidence ORDER BY language_reference_id"
    ) { statement, digest in
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
  }

  static func levelMappingSHA256(_ database: OpaquePointer) throws -> String {
    try evidenceDigest(
      database,
      sql: "SELECT language_reference_id, level FROM level_evidence ORDER BY language_reference_id"
    ) { statement, digest in
      var level = UInt64(sqlite3_column_int64(statement, 1)).bigEndian
      digest.update(data: Data(bytes: &level, count: MemoryLayout<UInt64>.size))
    }
  }

  private static func evidenceDigest(
    _ database: OpaquePointer, sql: String,
    updatingWithRow updateWithRow: (OpaquePointer, inout SHA256) throws -> Void
  ) throws -> String {
    var statement: OpaquePointer?
    guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK, let statement
    else { throw sqliteError(database) }
    defer { sqlite3_finalize(statement) }
    var digest = SHA256()
    while sqlite3_step(statement) == SQLITE_ROW {
      guard let identifier = sqlite3_column_blob(statement, 0) else {
        throw FrequencyPackError.invalidArtifact
      }
      digest.update(
        data: Data(bytes: identifier, count: Int(sqlite3_column_bytes(statement, 0))))
      try updateWithRow(statement, &digest)
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

  private init(verified: FrequencyPackArtifact, movedTo url: URL) {
    self.url = url
    manifest = verified.manifest
  }

  func moved(to url: URL) -> FrequencyPackArtifact {
    FrequencyPackArtifact(verified: self, movedTo: url)
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

  func validateSmokeTest() throws {
    guard let pinned = LanguageReferenceID(rawValue: manifest.smokeTest.languageReferenceID).bytes
    else { throw FrequencyPackError.invalidArtifact }
    var database: OpaquePointer?
    guard sqlite3_open_v2(url.path, &database, SQLITE_OPEN_READONLY, nil) == SQLITE_OK,
      let database
    else {
      if let database { sqlite3_close(database) }
      throw FrequencyPackError.invalidArtifact
    }
    defer { sqlite3_close(database) }
    var statement: OpaquePointer?
    let sql =
      manifest.packKind == .level
      ? "SELECT level FROM level_evidence WHERE language_reference_id = ?"
      : "SELECT rank FROM frequency_evidence WHERE language_reference_id = ?"
    guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK, let statement
    else { throw FrequencyPackError.invalidArtifact }
    defer { sqlite3_finalize(statement) }
    sqliteBind(pinned, at: 1, to: statement)
    guard sqlite3_step(statement) == SQLITE_ROW,
      sqlite3_column_int64(statement, 0) == Int64(manifest.smokeTest.rank)
    else { throw FrequencyPackError.invalidArtifact }
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
