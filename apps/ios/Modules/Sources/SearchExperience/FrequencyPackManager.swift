import Foundation

struct FrequencyPackID: Codable, Hashable, RawRepresentable, Sendable {
  let rawValue: String

  init(rawValue: String) {
    self.rawValue = rawValue
  }

  init(from decoder: Decoder) throws {
    rawValue = try decoder.singleValueContainer().decode(String.self)
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    try container.encode(rawValue)
  }
}

struct FrequencyPackCatalog: Codable, Equatable, Sendable {
  let schemaVersion: Int
  let packs: [FrequencyPackManifest]
  let trustedHistoricalManifests: [FrequencyPackManifest]

  var allTrustedManifests: [FrequencyPackManifest] {
    packs + trustedHistoricalManifests
  }

  init(
    schemaVersion: Int,
    packs: [FrequencyPackManifest],
    trustedHistoricalManifests: [FrequencyPackManifest] = []
  ) {
    self.schemaVersion = schemaVersion
    self.packs = packs
    self.trustedHistoricalManifests = trustedHistoricalManifests
  }

  static func bundled() throws -> FrequencyPackCatalog {
    guard let url = Bundle.module.url(forResource: "FrequencyPackCatalog", withExtension: "json")
    else { throw FrequencyPackError.invalidCatalog }
    let catalog = try JSONDecoder().decode(Self.self, from: Data(contentsOf: url))
    guard catalog.schemaVersion == 1, catalog.packs.count >= 2,
      catalog.packs.contains(where: \.bundled),
      Set(catalog.packs.map(\.packID)).count == catalog.packs.count,
      // A historical manifest may share its pack version with the current one when only
      // derived hashes changed, such as after a language-data rebuild.
      Set(
        try catalog.allTrustedManifests.map {
          "\($0.packID.rawValue)@\($0.packVersion)@\(try $0.trustSHA256())"
        }
      ).count == catalog.packs.count + catalog.trustedHistoricalManifests.count,
      catalog.allTrustedManifests.allSatisfy({
        $0.mappingPolicyVersion == 1 && $0.presentationPolicyVersion == 1
          && $0.runtimeInstallerVersion == 1 && !$0.offlineImporterSHA256.isEmpty
          && !$0.mappingPolicySHA256.isEmpty && !$0.languageDataSHA256.isEmpty
          && !$0.artifactContentSHA256.isEmpty
          && $0.hasValidSourceContract && $0.hasValidSmokeTest
          && ($0.packKind == .rank || ($0.bundled && !$0.removable))
      }),
      catalog.trustedHistoricalManifests.allSatisfy({ historical in
        !historical.bundled && catalog.packs.contains { $0.packID == historical.packID }
      })
    else { throw FrequencyPackError.invalidCatalog }
    return catalog
  }

  /// The artifact shipped in the app for each bundled pack.
  func bundledArtifactURLs() throws -> [FrequencyPackID: URL] {
    try Dictionary(
      uniqueKeysWithValues: packs.filter(\.bundled).map { manifest in
        guard let resource = manifest.bundledResource,
          let url = Bundle.module.url(forResource: resource, withExtension: "sqlite3")
        else { throw FrequencyPackError.missingBundledPack }
        return (manifest.packID, url)
      })
  }

  static func languageDataURL() throws -> URL {
    guard
      let url = Bundle.module.url(
        forResource: "LanguageReferenceData", withExtension: "sqlite3")
    else { throw FrequencyPackError.invalidArtifact }
    return url
  }
}

/// What a pack's value measures. Rank packs order words by corpus frequency; level packs place
/// words in coarse study levels such as JLPT N5–N1.
enum FrequencyPackKind: String, Codable, Sendable {
  case rank
  case level
}

struct FrequencyPackManifest: Codable, Equatable, Sendable {
  let packID: FrequencyPackID
  let packVersion: String
  /// Absent for rank packs so their encoded manifests, and the trust hashes of installed
  /// records, stay unchanged.
  let kind: FrequencyPackKind?
  let displayName: String
  let domain: String
  let domainDescription: String
  let sourceIdentity: String
  let sourceSnapshot: String
  let measurement: String
  let tokenizer: String
  let normalization: String
  let rankTiePolicy: String
  let downloadURL: URL
  let sourceBytes: Int
  let sourceSHA256: String
  let sourceTotalTokens: Int
  let coveredSourceRows: Int
  let mappedRows: Int
  let ambiguousRows: Int
  let unmappedRows: Int
  let duplicateMappings: Int
  let mappingSHA256: String
  let artifactContentSHA256: String
  let mappingPolicyVersion: Int
  let mappingPolicySHA256: String
  let offlineImporterSHA256: String
  let runtimeInstallerVersion: Int
  let presentationPolicyVersion: Int
  let presentationCapabilities: [String]
  let languageDataSHA256: String
  let bundledArtifactSHA256: String?
  /// The app resource name of a bundled pack's artifact.
  let bundledResource: String?
  let corpusDocuments: Int?
  let corpusVideos: Int?
  let corpusChannels: Int?
  let attribution: String
  let bundled: Bool
  let removable: Bool
  let orderedJSONSource: FrequencyPackOrderedJSONSource?
  let smokeTest: FrequencyPackSmokeTest

  var packKind: FrequencyPackKind { kind ?? .rank }

  var hasValidSourceContract: Bool {
    guard let orderedJSONSource else { return true }
    return !bundled && orderedJSONSource.rawJSONBytes > 0
      && !orderedJSONSource.archiveEntry.isEmpty
      && !presentationCapabilities.contains("count")
  }

  var hasValidSmokeTest: Bool {
    smokeTest.rank > 0
      && (packKind == .rank || JLPTLevel(rawValue: smokeTest.rank) != nil)
      && smokeTest.languageReferenceID.count == 32
      && smokeTest.languageReferenceID.unicodeScalars.allSatisfy {
        CharacterSet(charactersIn: "0123456789abcdef").contains($0)
      }
  }

  var disclosure: FrequencyPackDisclosure {
    FrequencyPackDisclosure(
      id: packID,
      kind: packKind,
      displayName: displayName,
      domain: domain,
      domainDescription: domainDescription,
      version: packVersion,
      attribution: attribution
    )
  }

  func trustSHA256() throws -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    return try encoder.encode(self).sha256
  }
}

struct FrequencyPackOrderedJSONSource: Codable, Equatable, Sendable {
  let archiveEntry: String
  let rawJSONBytes: Int
}

struct FrequencyPackSmokeTest: Codable, Equatable, Sendable {
  let languageReferenceID: String
  /// The expected rank, or for a level pack the expected level number (5 for N5).
  let rank: Int
}

struct FrequencyPackDisclosure: Equatable, Sendable {
  let id: FrequencyPackID
  let kind: FrequencyPackKind
  let displayName: String
  let domain: String
  let domainDescription: String
  let version: String
  let attribution: String

  /// A compact label for rank chips.
  var shortName: String {
    switch id.rawValue {
    case "zenbu.tubelex.youtube.ja.unidic-3.1": "YouTube"
    case "zenbu.wikipedia.written.ja.unidic-3.1": "Wikipedia"
    case "zenbu.jlpt.waller.levels": "JLPT"
    default: displayName
    }
  }
}

struct FrequencyPackSnapshot: Equatable, Sendable {
  /// Enabled packs in the learner's priority order. The first pack orders search results.
  let enabledPackIDs: [FrequencyPackID]
  let packs: [FrequencyPackState]

  var enabledPacks: [FrequencyPackState] {
    enabledPackIDs.compactMap { id in packs.first { $0.id == id } }
  }
}

struct FrequencyPackState: Equatable, Identifiable, Sendable {
  var id: FrequencyPackID { manifest.packID }
  let manifest: FrequencyPackManifest
  let isInstalled: Bool
  let isEnabled: Bool
  let installedBytes: Int?
  let failureMessage: String?
  let updateStatus: String
  let updateAvailable: Bool

  var availableActions: [FrequencyPackAction] {
    guard isInstalled else { return [.download] }
    return [isEnabled ? .disable : .enable]
      + (updateAvailable ? [.update] : [])
      + (manifest.removable ? [.remove] : [])
  }
}

enum FrequencyPackAction: Equatable, Sendable {
  case download
  case enable
  case disable
  case update
  case remove

  var label: String {
    switch self {
    case .download: "Download"
    case .enable: "Enable"
    case .disable: "Disable"
    case .update: "Download Update"
    case .remove: "Remove Pack"
    }
  }
}

struct InstalledFrequencyPackRecord: Codable, Equatable, Sendable {
  let packID: FrequencyPackID
  let packVersion: String
  let manifestSHA256: String
  let artifactSHA256: String
}

actor FrequencyPackManager {
  typealias Download = @Sendable (URL) async throws -> Data

  private let catalog: FrequencyPackCatalog
  private let bundledArtifactURLs: [FrequencyPackID: URL]
  private let languageDataURL: URL
  private let storageDirectory: URL
  private let downloadSource: Download
  private var enabledPackIDs: [FrequencyPackID]
  private var installedRecords: [FrequencyPackID: InstalledFrequencyPackRecord]
  private var failures: [FrequencyPackID: String] = [:]
  /// Artifacts already verified against their manifest. Verification scans and hashes every
  /// row, so lookups reuse these instead of re-verifying on every search.
  private var verifiedArtifacts: [FrequencyPackID: FrequencyPackArtifact] = [:]

  init(
    catalog: FrequencyPackCatalog,
    bundledArtifactURLs: [FrequencyPackID: URL],
    languageDataURL: URL,
    storageDirectory: URL,
    download: @escaping Download
  ) throws {
    let bundledPacks = catalog.packs.filter(\.bundled)
    guard !bundledPacks.isEmpty, bundledPacks.allSatisfy({ !$0.removable }) else {
      throw FrequencyPackError.invalidCatalog
    }
    self.catalog = catalog
    self.bundledArtifactURLs = bundledArtifactURLs
    self.languageDataURL = languageDataURL
    self.storageDirectory = storageDirectory
    downloadSource = download
    try FileManager.default.createDirectory(
      at: storageDirectory, withIntermediateDirectories: true)
    let languageDataSHA256 = try Data(contentsOf: languageDataURL).sha256
    for bundled in bundledPacks {
      guard let url = bundledArtifactURLs[bundled.packID],
        let bundledSHA256 = bundled.bundledArtifactSHA256,
        !bundledSHA256.isEmpty,
        try Data(contentsOf: url).sha256 == bundledSHA256,
        languageDataSHA256 == bundled.languageDataSHA256
      else { throw FrequencyPackError.invalidArtifact }
      if bundled.packKind == .rank {
        guard
          let mappingPolicyURL = Bundle.module.url(
            forResource: "FrequencyPackMappingV1", withExtension: "sql"),
          try Data(contentsOf: mappingPolicyURL).sha256 == bundled.mappingPolicySHA256
        else { throw FrequencyPackError.invalidArtifact }
      }
      try FrequencyPackArtifact(url: url, manifest: bundled).validateSmokeTest()
    }
    let stateURL = storageDirectory.appendingPathComponent("state.json")
    let saved = try? JSONDecoder().decode(
      PersistedFrequencyPackState.self, from: Data(contentsOf: stateURL))
    let currentPackIDs = Set(catalog.packs.map(\.packID))
    for record in saved?.installedRecords ?? [] where !currentPackIDs.contains(record.packID) {
      try? FileManager.default.removeItem(
        at: Self.artifactURL(for: record.packID, in: storageDirectory))
    }
    let validatedRecords: [FrequencyPackID: InstalledFrequencyPackRecord] = Dictionary(
      uniqueKeysWithValues: (saved?.installedRecords ?? []).compactMap { record in
        guard let manifest = catalog.packs.first(where: { $0.packID == record.packID }),
          !manifest.bundled,
          Self.validInstalledRecord(
            record,
            manifest: manifest,
            trustedManifests: catalog.allTrustedManifests,
            at: Self.artifactURL(for: record.packID, in: storageDirectory)
          )
        else { return nil }
        return (record.packID, record)
      })
    for record in saved?.installedRecords ?? []
    where validatedRecords[record.packID] == nil && currentPackIDs.contains(record.packID) {
      try? FileManager.default.removeItem(
        at: Self.artifactURL(for: record.packID, in: storageDirectory))
    }
    installedRecords = validatedRecords
    // State saved before multiple enabled packs stored one active pack; it becomes the only
    // enabled pack. A new install enables every bundled pack in catalog order.
    let bundledIDs = bundledPacks.map(\.packID)
    let savedIDs = saved.map { $0.enabledPackIDs ?? $0.activePackID.map { [$0] } ?? [] }
    var ids = savedIDs ?? bundledIDs
    // A bundled pack added in an app update is enabled once, ahead of the learner's packs.
    // Later disabling it sticks because it is then remembered as known.
    let knownBundledIDs = Set(
      saved.map { $0.knownBundledPackIDs ?? Self.legacyBundledPackIDs } ?? bundledIDs)
    ids.insert(contentsOf: bundledIDs.filter { !knownBundledIDs.contains($0) }, at: 0)
    var seen = Set<FrequencyPackID>()
    enabledPackIDs = ids.filter { id in
      catalog.packs.contains(where: { $0.packID == id })
        && (bundledIDs.contains(id) || validatedRecords[id] != nil)
        && seen.insert(id).inserted
    }
    try Self.persist(enabledPackIDs, installedRecords, bundledIDs, in: storageDirectory)
  }

  /// Bundled packs in state saved before bundled packs were tracked.
  private static let legacyBundledPackIDs = [
    FrequencyPackID(rawValue: "zenbu.tubelex.youtube.ja.unidic-3.1")
  ]

  func snapshot() throws -> FrequencyPackSnapshot {
    FrequencyPackSnapshot(
      enabledPackIDs: enabledPackIDs,
      packs: catalog.packs.map { manifest in
        let url = artifactURL(for: manifest)
        let installedRecord = installedRecords[manifest.packID]
        let installed = manifest.bundled || installedRecord != nil
        let updateAvailable =
          installedRecord.map { $0.packVersion != manifest.packVersion } ?? false
        let bytes =
          installed
          ? (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize)
          : nil
        return FrequencyPackState(
          manifest: manifest,
          isInstalled: installed,
          isEnabled: enabledPackIDs.contains(manifest.packID),
          installedBytes: bytes,
          failureMessage: failures[manifest.packID],
          updateStatus: manifest.bundled
            ? "Included"
            : (updateAvailable
              ? "Update available: \(manifest.packVersion)"
              : (installed ? "Up to date" : "Available")),
          updateAvailable: updateAvailable
        )
      }
    )
  }

  func evidence(for id: LanguageReferenceID) throws -> FrequencyRanks {
    guard let result = try evidence(for: [id])[id] else {
      throw FrequencyPackError.invalidArtifact
    }
    return result
  }

  /// Returns one result per enabled pack for each entry, in priority order. With no enabled
  /// packs, every entry has an empty list.
  func evidence(for ids: [LanguageReferenceID]) throws -> [LanguageReferenceID: FrequencyRanks] {
    var ranks = Dictionary(uniqueKeysWithValues: ids.map { ($0, FrequencyRanks()) })
    for packID in enabledPackIDs {
      guard let catalogManifest = catalog.packs.first(where: { $0.packID == packID }) else {
        throw FrequencyPackError.invalidCatalog
      }
      let manifest = effectiveManifest(for: catalogManifest)
      let results: [LanguageReferenceID: FrequencyLookupResult]
      do {
        results = try verifiedArtifact(for: manifest).evidence(for: ids)
      } catch {
        verifiedArtifacts[packID] = nil
        results = FrequencyLookupResult.unavailableResults(
          for: ids, pack: manifest.disclosure, reason: "Frequency data unavailable")
      }
      for id in ids {
        guard let result = results[id] else { throw FrequencyPackError.invalidArtifact }
        ranks[id, default: []].append(result)
      }
    }
    return ranks
  }

  func download(_ packID: FrequencyPackID) async throws {
    guard let manifest = catalog.packs.first(where: { $0.packID == packID }), !manifest.bundled
    else { throw FrequencyPackError.invalidPack }
    failures[packID] = nil
    do {
      let source = try await downloadSource(manifest.downloadURL)
      guard source.count == manifest.sourceBytes, source.sha256 == manifest.sourceSHA256 else {
        throw FrequencyPackError.checksumMismatch
      }
      let record = try FrequencyPackInstaller.install(
        source: source,
        manifest: manifest,
        languageDataURL: languageDataURL,
        destination: artifactURL(for: manifest)
      )
      let isNewInstall = installedRecords[packID] == nil
      installedRecords[packID] = record
      verifiedArtifacts[packID] = nil
      if isNewInstall, !enabledPackIDs.contains(packID) {
        enabledPackIDs.append(packID)
      }
      try persist()
    } catch {
      failures[packID] =
        error as? FrequencyPackError == .checksumMismatch
        ? "Downloaded file failed checksum validation."
        : "Download or validation failed. Try again."
      throw error
    }
  }

  /// Appends an installed pack to the end of the enabled priority order.
  func enable(_ packID: FrequencyPackID) throws {
    guard let manifest = catalog.packs.first(where: { $0.packID == packID }) else {
      throw FrequencyPackError.packNotInstalled
    }
    let installedIsValid =
      installedRecords[packID].map {
        Self.validInstalledRecord(
          $0,
          manifest: manifest,
          trustedManifests: catalog.allTrustedManifests,
          at: artifactURL(for: manifest)
        )
      } ?? false
    guard manifest.bundled || installedIsValid else { throw FrequencyPackError.packNotInstalled }
    let installedManifest = effectiveManifest(for: manifest)
    let artifact = try FrequencyPackArtifact(
      url: artifactURL(for: manifest), manifest: installedManifest)
    try artifact.validateSmokeTest()
    guard !enabledPackIDs.contains(packID) else { return }
    enabledPackIDs.append(packID)
    try persist()
  }

  func disable(_ packID: FrequencyPackID) throws {
    enabledPackIDs.removeAll { $0 == packID }
    try persist()
  }

  /// Replaces the priority order. The new order must contain exactly the enabled packs.
  func reorderEnabled(_ packIDs: [FrequencyPackID]) throws {
    guard packIDs.count == enabledPackIDs.count, Set(packIDs) == Set(enabledPackIDs) else {
      throw FrequencyPackError.invalidPack
    }
    enabledPackIDs = packIDs
    try persist()
  }

  func remove(_ packID: FrequencyPackID) throws {
    guard let manifest = catalog.packs.first(where: { $0.packID == packID }), manifest.removable
    else { throw FrequencyPackError.packNotRemovable }
    if FileManager.default.fileExists(atPath: artifactURL(for: manifest).path) {
      try FileManager.default.removeItem(at: artifactURL(for: manifest))
    }
    failures[packID] = nil
    installedRecords[packID] = nil
    verifiedArtifacts[packID] = nil
    enabledPackIDs.removeAll { $0 == packID }
    try persist()
  }

  private func verifiedArtifact(for manifest: FrequencyPackManifest) throws -> FrequencyPackArtifact {
    if let artifact = verifiedArtifacts[manifest.packID], artifact.manifest == manifest {
      return artifact
    }
    let artifact = try FrequencyPackArtifact(url: artifactURL(for: manifest), manifest: manifest)
    verifiedArtifacts[manifest.packID] = artifact
    return artifact
  }

  private func artifactURL(for manifest: FrequencyPackManifest) -> URL {
    // Bundled packs read their shipped artifact; downloaded packs live in storage.
    bundledArtifactURLs[manifest.packID]
      ?? Self.artifactURL(for: manifest.packID, in: storageDirectory)
  }

  private func effectiveManifest(for catalogManifest: FrequencyPackManifest)
    -> FrequencyPackManifest
  {
    guard !catalogManifest.bundled,
      let record = installedRecords[catalogManifest.packID],
      let installedManifest = Self.trustedManifest(
        for: record,
        in: catalog.allTrustedManifests
      )
    else { return catalogManifest }
    return installedManifest
  }

  private static func artifactURL(for packID: FrequencyPackID, in directory: URL) -> URL {
    directory.appendingPathComponent(packID.rawValue + ".sqlite3")
  }

  private func persist() throws {
    try Self.persist(
      enabledPackIDs, installedRecords, catalog.packs.filter(\.bundled).map(\.packID),
      in: storageDirectory)
  }

  private static func persist(
    _ enabledPackIDs: [FrequencyPackID],
    _ installedRecords: [FrequencyPackID: InstalledFrequencyPackRecord],
    _ knownBundledPackIDs: [FrequencyPackID],
    in storageDirectory: URL
  ) throws {
    let data = try JSONEncoder().encode(
      PersistedFrequencyPackState(
        enabledPackIDs: enabledPackIDs,
        activePackID: nil,
        knownBundledPackIDs: knownBundledPackIDs,
        installedRecords: installedRecords.values.sorted {
          $0.packID.rawValue < $1.packID.rawValue
        }
      ))
    try data.write(
      to: storageDirectory.appendingPathComponent("state.json"), options: .atomic)
  }

  private static func validInstalledRecord(
    _ record: InstalledFrequencyPackRecord,
    manifest: FrequencyPackManifest,
    trustedManifests: [FrequencyPackManifest],
    at url: URL
  ) -> Bool {
    guard let installedManifest = trustedManifest(for: record, in: trustedManifests),
      record.packID == manifest.packID,
      installedManifest.packID == manifest.packID,
      FileManager.default.fileExists(atPath: url.path),
      (try? Data(contentsOf: url).sha256) == record.artifactSHA256,
      Self.validArtifact(at: url, manifest: installedManifest)
    else { return false }
    return true
  }

  private static func trustedManifest(
    for record: InstalledFrequencyPackRecord,
    in trustedManifests: [FrequencyPackManifest]
  ) -> FrequencyPackManifest? {
    trustedManifests.first { manifest in
      manifest.packID == record.packID
        && manifest.packVersion == record.packVersion
        && (try? manifest.trustSHA256()) == record.manifestSHA256
    }
  }

  private static func validArtifact(at url: URL, manifest: FrequencyPackManifest) -> Bool {
    do {
      let artifact = try FrequencyPackArtifact(url: url, manifest: manifest)
      try artifact.validateSmokeTest()
      return true
    } catch {
      return false
    }
  }
}

private struct PersistedFrequencyPackState: Codable {
  let enabledPackIDs: [FrequencyPackID]?
  /// Written by versions that supported one active pack; read only for migration.
  let activePackID: FrequencyPackID?
  /// Bundled packs this state has already seen, so a newly bundled pack is enabled only once.
  let knownBundledPackIDs: [FrequencyPackID]?
  let installedRecords: [InstalledFrequencyPackRecord]
}
