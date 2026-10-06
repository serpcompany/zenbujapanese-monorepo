import Foundation

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
    let languageDataSHA256 = try fileSHA256(languageDataURL)
    for bundled in bundledPacks {
      guard let url = bundledArtifactURLs[bundled.packID],
        let bundledSHA256 = bundled.bundledArtifactSHA256,
        !bundledSHA256.isEmpty,
        try fileSHA256(url) == bundledSHA256,
        languageDataSHA256 == bundled.languageDataSHA256
      else { throw FrequencyPackError.invalidArtifact }
      if bundled.packKind == .rank {
        guard
          let mappingPolicyURL = Bundle.module.url(
            forResource: "FrequencyPackMappingV\(bundled.mappingPolicyVersion)",
            withExtension: "sql"),
          try fileSHA256(mappingPolicyURL) == bundled.mappingPolicySHA256
        else { throw FrequencyPackError.invalidArtifact }
      }
      let artifact = try FrequencyPackArtifact(url: url, manifest: bundled)
      try artifact.validateSmokeTest()
      verifiedArtifacts[bundled.packID] = artifact
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
    let bundledIDs = bundledPacks.map(\.packID)
    let savedIDs = saved.map { $0.enabledPackIDs ?? $0.activePackID.map { [$0] } ?? [] }
    var ids = savedIDs ?? bundledIDs
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
    verifiedArtifacts[packID] = artifact
    guard !enabledPackIDs.contains(packID) else { return }
    enabledPackIDs.append(packID)
    try persist()
  }

  func disable(_ packID: FrequencyPackID) throws {
    enabledPackIDs.removeAll { $0 == packID }
    try persist()
  }

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
      (try? fileSHA256(url)) == record.artifactSHA256,
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
  let activePackID: FrequencyPackID?
  let knownBundledPackIDs: [FrequencyPackID]?
  let installedRecords: [InstalledFrequencyPackRecord]
}
