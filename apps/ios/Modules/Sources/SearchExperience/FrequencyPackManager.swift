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
    guard catalog.schemaVersion == 1, catalog.packs.count == 2,
      catalog.packs.filter(\.bundled).count == 1,
      Set(catalog.packs.map(\.packID)).count == catalog.packs.count,
      Set(
        catalog.allTrustedManifests.map {
          "\($0.packID.rawValue)@\($0.packVersion)"
        }
      ).count == catalog.packs.count + catalog.trustedHistoricalManifests.count,
      catalog.allTrustedManifests.allSatisfy({
        $0.mappingPolicyVersion == 1 && $0.presentationPolicyVersion == 1
          && $0.runtimeInstallerVersion == 1 && !$0.offlineImporterSHA256.isEmpty
          && !$0.mappingPolicySHA256.isEmpty && !$0.languageDataSHA256.isEmpty
          && !$0.artifactContentSHA256.isEmpty
      }),
      catalog.trustedHistoricalManifests.allSatisfy({ historical in
        !historical.bundled && catalog.packs.contains { $0.packID == historical.packID }
      })
    else { throw FrequencyPackError.invalidCatalog }
    return catalog
  }
}

struct FrequencyPackManifest: Codable, Equatable, Sendable {
  let packID: FrequencyPackID
  let packVersion: String
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
  let corpusDocuments: Int?
  let corpusVideos: Int?
  let corpusChannels: Int?
  let licenseIdentifier: String
  let attribution: String
  let licenseURL: URL
  let licenseResource: String
  let bundled: Bool
  let removable: Bool

  var disclosure: FrequencyPackDisclosure {
    FrequencyPackDisclosure(
      id: packID,
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

struct FrequencyPackDisclosure: Equatable, Sendable {
  let id: FrequencyPackID
  let displayName: String
  let domain: String
  let domainDescription: String
  let version: String
  let attribution: String
}

struct FrequencyPackSnapshot: Equatable, Sendable {
  let activePackID: FrequencyPackID
  let packs: [FrequencyPackState]
}

struct FrequencyPackState: Equatable, Identifiable, Sendable {
  var id: FrequencyPackID { manifest.packID }
  let manifest: FrequencyPackManifest
  let isInstalled: Bool
  let isActive: Bool
  let installedBytes: Int?
  let failureMessage: String?
  let updateStatus: String
  let updateAvailable: Bool

  var availableActions: [FrequencyPackAction] {
    guard isInstalled else { return [.download] }
    guard manifest.removable else { return [] }
    return (isActive ? [] : [.activate]) + (updateAvailable ? [.update] : []) + [.remove]
  }
}

enum FrequencyPackAction: Equatable, Sendable {
  case download
  case activate
  case update
  case remove

  var label: String {
    switch self {
    case .download: "Download"
    case .activate: "Use This Dictionary"
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
  private let bundledArtifactURL: URL
  private let languageDataURL: URL
  private let storageDirectory: URL
  private let downloadSource: Download
  private var activePackID: FrequencyPackID
  private var installedRecords: [FrequencyPackID: InstalledFrequencyPackRecord]
  private var failures: [FrequencyPackID: String] = [:]

  init(
    catalog: FrequencyPackCatalog,
    bundledArtifactURL: URL,
    languageDataURL: URL,
    storageDirectory: URL,
    download: @escaping Download
  ) throws {
    guard let bundled = catalog.packs.first(where: \.bundled),
      catalog.packs.filter(\.bundled).count == 1,
      !bundled.removable
    else { throw FrequencyPackError.invalidCatalog }
    self.catalog = catalog
    self.bundledArtifactURL = bundledArtifactURL
    self.languageDataURL = languageDataURL
    self.storageDirectory = storageDirectory
    downloadSource = download
    try FileManager.default.createDirectory(
      at: storageDirectory, withIntermediateDirectories: true)
    guard let bundledSHA256 = bundled.bundledArtifactSHA256,
      !bundledSHA256.isEmpty,
      try Data(contentsOf: bundledArtifactURL).sha256 == bundledSHA256,
      try Data(contentsOf: languageDataURL).sha256 == bundled.languageDataSHA256,
      let mappingPolicyURL = Bundle.module.url(
        forResource: "FrequencyPackMappingV1", withExtension: "sql"),
      try Data(contentsOf: mappingPolicyURL).sha256 == bundled.mappingPolicySHA256
    else { throw FrequencyPackError.invalidArtifact }
    _ = try FrequencyPackArtifact(url: bundledArtifactURL, manifest: bundled)
    let stateURL = storageDirectory.appendingPathComponent("state.json")
    let saved = try? JSONDecoder().decode(
      PersistedFrequencyPackState.self, from: Data(contentsOf: stateURL))
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
    installedRecords = validatedRecords
    let savedID = saved?.activePackID
    if let savedID,
      catalog.packs.contains(where: { $0.packID == savedID }),
      savedID == bundled.packID || validatedRecords[savedID] != nil
    {
      activePackID = savedID
    } else {
      activePackID = bundled.packID
    }
  }

  func snapshot() throws -> FrequencyPackSnapshot {
    FrequencyPackSnapshot(
      activePackID: activePackID,
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
          isActive: manifest.packID == activePackID,
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

  func evidence(for id: LanguageReferenceID) throws -> FrequencyLookupResult {
    guard let catalogManifest = catalog.packs.first(where: { $0.packID == activePackID }) else {
      throw FrequencyPackError.invalidCatalog
    }
    let manifest = effectiveManifest(for: catalogManifest)
    do {
      return try FrequencyPackArtifact(
        url: artifactURL(for: manifest), manifest: manifest
      ).evidence(for: id)
    } catch {
      return .unavailable(
        FrequencyPackUnavailable(
          pack: manifest.disclosure, reason: "Frequency data unavailable"))
    }
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
      installedRecords[packID] = record
      try persist()
    } catch {
      failures[packID] =
        error as? FrequencyPackError == .checksumMismatch
        ? "Downloaded file failed checksum validation."
        : "Download or validation failed. Try again."
      throw error
    }
  }

  func activate(_ packID: FrequencyPackID) throws {
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
    _ = try FrequencyPackArtifact(url: artifactURL(for: manifest), manifest: installedManifest)
    activePackID = packID
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
    if activePackID == packID {
      activePackID = catalog.packs.first(where: \.bundled)!.packID
    }
    try persist()
  }

  private func artifactURL(for manifest: FrequencyPackManifest) -> URL {
    manifest.bundled
      ? bundledArtifactURL
      : Self.artifactURL(for: manifest.packID, in: storageDirectory)
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
    let data = try JSONEncoder().encode(
      PersistedFrequencyPackState(
        activePackID: activePackID,
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
      (try? FrequencyPackArtifact(url: url, manifest: installedManifest)) != nil
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
}

private struct PersistedFrequencyPackState: Codable {
  let activePackID: FrequencyPackID
  let installedRecords: [InstalledFrequencyPackRecord]
}
