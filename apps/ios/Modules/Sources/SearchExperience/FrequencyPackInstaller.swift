import CryptoKit
import Foundation
import SQLite3
import ZIPFoundation

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
    let parsedSource = try sourceRows(source, manifest: manifest)

    let candidate = destination.deletingLastPathComponent()
      .appendingPathComponent(".\(UUID().uuidString).sqlite3")
    defer { try? FileManager.default.removeItem(at: candidate) }
    var database: OpaquePointer?
    guard sqlite3_open(candidate.path, &database) == SQLITE_OK, let handle = database else {
      throw FrequencyPackError.invalidArtifact
    }
    defer {
      if let database { sqlite3_close(database) }
    }
    try execute(
      handle,
      "PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;"
        + "CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;"
        + "CREATE TABLE source_rows(rank INTEGER PRIMARY KEY, form TEXT NOT NULL, source_count INTEGER NOT NULL, source_pos TEXT NOT NULL, source_record_digest BLOB NOT NULL);"
        + "CREATE TABLE frequency_evidence(language_reference_id BLOB PRIMARY KEY, rank INTEGER NOT NULL, source_count INTEGER NOT NULL, covered_source_rows INTEGER NOT NULL, mapping_relation TEXT NOT NULL, matched_form TEXT NOT NULL, source_pos TEXT NOT NULL, source_record_digest BLOB NOT NULL) WITHOUT ROWID;"
        + "BEGIN IMMEDIATE;"
    )
    try insert(parsedSource.rows, into: handle)
    guard parsedSource.rows.count == manifest.coveredSourceRows,
      parsedSource.totalTokens == manifest.sourceTotalTokens
    else {
      throw FrequencyPackError.invalidSource
    }
    try execute(handle, "COMMIT")
    try execute(
      handle,
      try mappingSQL(
        languageDataURL: languageDataURL,
        coveredSourceRows: manifest.coveredSourceRows
      ))
    let mapped = try scalar(handle, "SELECT COUNT(*) FROM frequency_evidence")
    let ambiguous = try scalar(
      handle,
      "SELECT COUNT(*) FROM resolutions WHERE candidate_count>1 AND pos_candidate_count != 1")
    let matchedSourceRows = try scalar(handle, "SELECT COUNT(*) FROM resolutions")
    let unmapped = manifest.coveredSourceRows - matchedSourceRows
    let eligible = try scalar(handle, "SELECT COUNT(*) FROM eligible")
    guard mapped == manifest.mappedRows, ambiguous == manifest.ambiguousRows,
      unmapped == manifest.unmappedRows, eligible - mapped == manifest.duplicateMappings,
      try FrequencyPackArtifactContent.mappingSHA256(handle) == manifest.mappingSHA256
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
        handle,
        "INSERT INTO metadata VALUES('\(sql(key))','\(sql(value))')")
    }
    try execute(
      handle,
      "DROP TABLE source_rows; CREATE INDEX frequency_evidence_rank_index ON frequency_evidence(rank,language_reference_id); VACUUM;"
    )
    let artifactSHA256 = try Data(contentsOf: candidate).sha256
    let artifact = try FrequencyPackArtifact(url: candidate, manifest: manifest)
    try artifact.validateSmokeTest()
    guard sqlite3_close(handle) == SQLITE_OK else { throw sqliteError(handle) }
    database = nil
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

  private static func insert(_ rows: [SourceRow], into database: OpaquePointer) throws {
    var statement: OpaquePointer?
    guard
      sqlite3_prepare_v2(
        database, "INSERT INTO source_rows VALUES(?, ?, ?, ?, ?)", -1, &statement, nil)
        == SQLITE_OK,
      let statement
    else { throw sqliteError(database) }
    defer { sqlite3_finalize(statement) }
    for row in rows {
      sqlite3_bind_int64(statement, 1, Int64(row.rank))
      bind(row.form, at: 2, to: statement)
      sqlite3_bind_int64(statement, 3, Int64(row.count))
      bind(row.partOfSpeech, at: 4, to: statement)
      bind(row.digest, at: 5, to: statement)
      guard sqlite3_step(statement) == SQLITE_DONE else { throw sqliteError(database) }
      sqlite3_reset(statement)
      sqlite3_clear_bindings(statement)
    }
  }

  private static func sourceRows(
    _ source: Data,
    manifest: FrequencyPackManifest
  ) throws -> (rows: [SourceRow], totalTokens: Int) {
    if let orderedJSONSource = manifest.orderedJSONSource {
      return try orderedJSONRows(source, contract: orderedJSONSource)
    }
    return try tabSeparatedRows(source)
  }

  private static func tabSeparatedRows(_ source: Data) throws
    -> (rows: [SourceRow], totalTokens: Int)
  {
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
    var rows: [SourceRow] = []
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
      let sourceRecord = Dictionary(
        uniqueKeysWithValues: fieldNames.enumerated().map { index, field in
          (field, columns.indices.contains(index) ? String(columns[index]) : "")
        })
      let sourceRecordData = try JSONSerialization.data(
        withJSONObject: sourceRecord, options: [.sortedKeys, .withoutEscapingSlashes])
      rows.append(
        try SourceRow(
          rank: rows.count + 1,
          rawForm: rawForm,
          count: count,
          partOfSpeech: posIndex.flatMap {
            columns.indices.contains($0) ? String(columns[$0]) : nil
          } ?? "",
          digest: Data(SHA256.hash(data: sourceRecordData))
        ))
    }
    guard let total else { throw FrequencyPackError.invalidSource }
    return (rows, total)
  }

  private static func orderedJSONRows(
    _ source: Data,
    contract: FrequencyPackOrderedJSONSource
  ) throws -> (rows: [SourceRow], totalTokens: Int) {
    let archive = try Archive(data: source, accessMode: .read)
    let entries = Array(archive)
    guard entries.count == 1, let entry = entries.first,
      entry.type == .file, entry.path == contract.archiveEntry,
      Int(entry.uncompressedSize) == contract.rawJSONBytes
    else { throw FrequencyPackError.invalidSource }
    var jsonData = Data()
    jsonData.reserveCapacity(contract.rawJSONBytes)
    _ = try archive.extract(entry) { jsonData.append($0) }
    guard jsonData.count == contract.rawJSONBytes,
      let sourceRows = try JSONSerialization.jsonObject(with: jsonData) as? [Any]
    else { throw FrequencyPackError.invalidSource }
    let rows = try sourceRows.enumerated().map { offset, value -> SourceRow in
      let rawForm: String
      switch value {
      case let form as String:
        rawForm = form
      case let pair as [String] where pair.count == 2:
        rawForm = pair[0]
      default:
        throw FrequencyPackError.invalidSource
      }
      let sourceRecord = try JSONSerialization.data(
        withJSONObject: value,
        options: [.fragmentsAllowed, .sortedKeys, .withoutEscapingSlashes]
      )
      return try SourceRow(
        rank: offset + 1,
        rawForm: rawForm,
        count: 0,
        partOfSpeech: "",
        digest: Data(SHA256.hash(data: sourceRecord))
      )
    }
    return (rows, 0)
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

  private struct SourceRow {
    let rank: Int
    let form: String
    let count: Int
    let partOfSpeech: String
    let digest: Data

    init(rank: Int, rawForm: String, count: Int, partOfSpeech: String, digest: Data) throws {
      let form = rawForm.precomposedStringWithCompatibilityMapping.trimmingCharacters(
        in: CharacterSet.whitespacesAndNewlines)
      guard !form.isEmpty else { throw FrequencyPackError.invalidSource }
      self.rank = rank
      self.form = form
      self.count = count
      self.partOfSpeech = partOfSpeech
      self.digest = digest
    }
  }

  private static let transientDestructor = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
}

extension Data {
  var sha256: String {
    SHA256.hash(data: self).map { String(format: "%02x", $0) }.joined()
  }
}
