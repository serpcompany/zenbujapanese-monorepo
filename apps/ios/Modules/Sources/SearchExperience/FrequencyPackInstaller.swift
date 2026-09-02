import CryptoKit
import Foundation
import SQLite3

enum FrequencyPackInstaller {
  static func install(
    source: Data,
    manifest: FrequencyPackManifest,
    languageDataURL: URL,
    destination: URL
  ) throws -> InstalledFrequencyPackRecord {
    guard try Data(contentsOf: languageDataURL).sha256 == manifest.languageDataSHA256,
      try mappingPolicySHA256() == manifest.mappingPolicySHA256
    else { throw FrequencyPackError.mappingMismatch }
    let decompressed = try (source as NSData).decompressed(using: .lzma) as Data
    guard let text = String(data: decompressed, encoding: .utf8) else {
      throw FrequencyPackError.invalidSource
    }
    let lines = text.split(separator: "\n", omittingEmptySubsequences: true)
    guard let header = lines.first?.split(separator: "\t", omittingEmptySubsequences: false),
      let wordIndex = header.firstIndex(of: "word"),
      let countIndex = header.firstIndex(of: "count")
    else { throw FrequencyPackError.invalidSource }
    let posIndex = header.firstIndex(of: "pos")
    let fieldNames = header.map(String.init)

    let candidate = destination.deletingLastPathComponent()
      .appendingPathComponent(".\(UUID().uuidString).sqlite3")
    defer { try? FileManager.default.removeItem(at: candidate) }
    var database: OpaquePointer?
    guard sqlite3_open(candidate.path, &database) == SQLITE_OK, let database else {
      throw FrequencyPackError.invalidArtifact
    }
    defer { sqlite3_close(database) }
    try execute(
      database,
      "PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;"
        + "CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;"
        + "CREATE TABLE source_rows(rank INTEGER PRIMARY KEY, form TEXT NOT NULL, source_count INTEGER NOT NULL, source_pos TEXT NOT NULL, source_record_digest BLOB NOT NULL);"
        + "CREATE TABLE frequency_evidence(language_reference_id BLOB PRIMARY KEY, rank INTEGER NOT NULL, source_count INTEGER NOT NULL, covered_source_rows INTEGER NOT NULL, mapping_relation TEXT NOT NULL, matched_form TEXT NOT NULL, source_pos TEXT NOT NULL, source_record_digest BLOB NOT NULL) WITHOUT ROWID;"
        + "BEGIN IMMEDIATE;"
    )
    var insert: OpaquePointer?
    guard
      sqlite3_prepare_v2(
        database, "INSERT INTO source_rows VALUES(?, ?, ?, ?, ?)", -1, &insert, nil)
        == SQLITE_OK,
      let insert
    else { throw sqliteError(database) }
    defer { sqlite3_finalize(insert) }
    var rank = 0
    var total: Int?
    for rawLine in lines.dropFirst() {
      let columns = rawLine.split(separator: "\t", omittingEmptySubsequences: false)
      guard columns.indices.contains(wordIndex), columns.indices.contains(countIndex),
        let count = Int(columns[countIndex])
      else { throw FrequencyPackError.invalidSource }
      let rawForm = String(columns[wordIndex])
      if rawForm == "[TOTAL]" {
        total = count
        continue
      }
      rank += 1
      let form = rawForm.precomposedStringWithCompatibilityMapping.trimmingCharacters(
        in: CharacterSet.whitespacesAndNewlines)
      guard !form.isEmpty else { throw FrequencyPackError.invalidSource }
      sqlite3_bind_int64(insert, 1, Int64(rank))
      bind(form, at: 2, to: insert)
      sqlite3_bind_int64(insert, 3, Int64(count))
      let sourcePOS =
        posIndex.flatMap { columns.indices.contains($0) ? String(columns[$0]) : nil } ?? ""
      bind(sourcePOS, at: 4, to: insert)
      let sourceRecord = Dictionary(
        uniqueKeysWithValues: fieldNames.enumerated().map { index, field in
          (field, columns.indices.contains(index) ? String(columns[index]) : "")
        })
      let sourceRecordData = try JSONSerialization.data(
        withJSONObject: sourceRecord, options: [.sortedKeys, .withoutEscapingSlashes])
      bind(Data(SHA256.hash(data: sourceRecordData)), at: 5, to: insert)
      guard sqlite3_step(insert) == SQLITE_DONE else { throw sqliteError(database) }
      sqlite3_reset(insert)
      sqlite3_clear_bindings(insert)
    }
    guard rank == manifest.coveredSourceRows, total == manifest.sourceTotalTokens else {
      throw FrequencyPackError.invalidSource
    }
    try execute(database, "COMMIT")
    try execute(
      database,
      try mappingSQL(
        languageDataURL: languageDataURL,
        coveredSourceRows: manifest.coveredSourceRows
      ))
    let mapped = try scalar(database, "SELECT COUNT(*) FROM frequency_evidence")
    let ambiguous = try scalar(
      database,
      "SELECT COUNT(*) FROM resolutions WHERE candidate_count>1 AND pos_candidate_count != 1")
    let matchedSourceRows = try scalar(database, "SELECT COUNT(*) FROM resolutions")
    let unmapped = manifest.coveredSourceRows - matchedSourceRows
    let eligible = try scalar(database, "SELECT COUNT(*) FROM eligible")
    guard mapped == manifest.mappedRows, ambiguous == manifest.ambiguousRows,
      unmapped == manifest.unmappedRows, eligible - mapped == manifest.duplicateMappings,
      try mappingSHA256(database) == manifest.mappingSHA256
    else { throw FrequencyPackError.mappingMismatch }
    for (key, value) in [
      ("artifact_schema", "zenbu.frequency-pack.v1"),
      ("pack_id", manifest.packID.rawValue),
      ("pack_version", manifest.packVersion),
      ("mapped_rows", String(mapped)),
      ("ambiguous_rows", String(ambiguous)),
      ("unmapped_rows", String(unmapped)),
      ("mapping_sha256", manifest.mappingSHA256),
      ("mapping_policy_version", String(manifest.mappingPolicyVersion)),
      ("mapping_policy_sha256", manifest.mappingPolicySHA256),
      ("presentation_policy_version", String(manifest.presentationPolicyVersion)),
      ("language_data_sha256", manifest.languageDataSHA256),
      ("source_total_tokens", String(manifest.sourceTotalTokens)),
      ("covered_source_rows", String(manifest.coveredSourceRows)),
      ("duplicate_mappings", String(manifest.duplicateMappings)),
    ] {
      try execute(
        database,
        "INSERT INTO metadata VALUES('\(sql(key))','\(sql(value))')")
    }
    try execute(
      database,
      "DROP TABLE source_rows; CREATE INDEX frequency_evidence_rank_index ON frequency_evidence(rank,language_reference_id); VACUUM;"
    )
    let artifactSHA256 = try Data(contentsOf: candidate).sha256
    _ = try FrequencyPackArtifact(url: candidate, manifest: manifest)
    try FileManager.default.createDirectory(
      at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
    if FileManager.default.fileExists(atPath: destination.path) {
      _ = try FileManager.default.replaceItemAt(destination, withItemAt: candidate)
    } else {
      try FileManager.default.moveItem(at: candidate, to: destination)
    }
    let record = InstalledFrequencyPackRecord(
      packID: manifest.packID,
      packVersion: manifest.packVersion,
      manifestSHA256: try manifest.trustSHA256(),
      artifactSHA256: artifactSHA256
    )
    return record
  }

  private static func mappingSHA256(_ database: OpaquePointer) throws -> String {
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
      guard let bytes = sqlite3_column_blob(statement, 0) else {
        throw FrequencyPackError.invalidArtifact
      }
      digest.update(data: Data(bytes: bytes, count: Int(sqlite3_column_bytes(statement, 0))))
      var rank = UInt64(sqlite3_column_int64(statement, 1)).bigEndian
      var count = UInt64(sqlite3_column_int64(statement, 2)).bigEndian
      digest.update(data: Data(bytes: &rank, count: 8))
      digest.update(data: Data(bytes: &count, count: 8))
      guard let form = sqlite3_column_text(statement, 3) else {
        throw FrequencyPackError.invalidArtifact
      }
      digest.update(data: Data(String(cString: form).utf8))
      for column in Int32(4)...Int32(5) {
        digest.update(data: Data([0]))
        guard let value = sqlite3_column_text(statement, column) else {
          throw FrequencyPackError.invalidArtifact
        }
        digest.update(data: Data(String(cString: value).utf8))
      }
      digest.update(data: Data([0]))
      guard let sourceDigest = sqlite3_column_blob(statement, 6) else {
        throw FrequencyPackError.invalidArtifact
      }
      digest.update(
        data: Data(
          bytes: sourceDigest,
          count: Int(sqlite3_column_bytes(statement, 6))
        ))
    }
    return digest.finalize().map { String(format: "%02x", $0) }.joined()
  }

  private static func mappingSQL(
    languageDataURL: URL,
    coveredSourceRows: Int
  ) throws -> String {
    guard let url = Bundle.module.url(forResource: "FrequencyPackMappingV1", withExtension: "sql")
    else { throw FrequencyPackError.invalidArtifact }
    return try String(contentsOf: url, encoding: .utf8)
      .replacingOccurrences(
        of: "{{LANGUAGE_DATA_PATH}}",
        with: languageDataURL.path.replacingOccurrences(of: "'", with: "''")
      )
      .replacingOccurrences(of: "{{COVERED_SOURCE_ROWS}}", with: String(coveredSourceRows))
  }

  private static func mappingPolicySHA256() throws -> String {
    guard let url = Bundle.module.url(forResource: "FrequencyPackMappingV1", withExtension: "sql")
    else { throw FrequencyPackError.invalidArtifact }
    return try Data(contentsOf: url).sha256
  }

  private static func scalar(_ database: OpaquePointer, _ sql: String) throws -> Int {
    var statement: OpaquePointer?
    guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK,
      let statement, sqlite3_step(statement) == SQLITE_ROW
    else { throw sqliteError(database) }
    defer { sqlite3_finalize(statement) }
    return Int(sqlite3_column_int64(statement, 0))
  }

  private static func execute(_ database: OpaquePointer, _ sql: String) throws {
    guard sqlite3_exec(database, sql, nil, nil, nil) == SQLITE_OK else {
      throw sqliteError(database)
    }
  }

  private static func sqliteError(_ database: OpaquePointer) -> FrequencyPackError {
    .sqlite(String(cString: sqlite3_errmsg(database)))
  }

  private static func bind(_ value: String, at index: Int32, to statement: OpaquePointer) {
    sqlite3_bind_text(statement, index, value, -1, transientDestructor)
  }

  private static func bind(_ value: Data, at index: Int32, to statement: OpaquePointer) {
    _ = value.withUnsafeBytes {
      sqlite3_bind_blob(statement, index, $0.baseAddress, Int32($0.count), transientDestructor)
    }
  }

  private static func sql(_ value: String) -> String {
    value.replacingOccurrences(of: "'", with: "''")
  }

  private static let transientDestructor = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
}

extension Data {
  var sha256: String {
    SHA256.hash(data: self).map { String(format: "%02x", $0) }.joined()
  }
}
