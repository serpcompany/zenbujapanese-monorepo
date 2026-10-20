import Foundation

actor FrequencyPackManager {
  typealias Progress = @Sendable (Double) -> Void
  typealias Download = @Sendable (URL, @escaping Progress) async throws -> Data

  static let unverifiedList = "Frequency data unavailable"

  nonisolated let lists: FrequencyLists
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
    lists: FrequencyLists = FrequencyLists(),
    download: @escaping Download
  ) throws {
    let bundledPacks = catalog.packs.filter(\.bundled)
    guard !bundledPacks.isEmpty, bundledPacks.allSatisfy({ !$0.removable }) else {
      throw FrequencyPackError.invalidCatalog
    }
    self.lists = lists
    self.catalog = catalog
    self.bundledArtifactURLs = bundledArtifactURLs
    self.languageDataURL = languageDataURL
    self.storageDirectory = storageDirectory
    downloadSource = download
    try FileManager.default.createDirectory(
      at: storageDirectory, withIntermediateDirectories: true)
    let kept = try FileManager.default.contentsOfDirectory(
      at: storageDirectory, includingPropertiesForKeys: nil)
    for staged in kept where staged.pathExtension == Self.stagedExtension {
      try? FileManager.default.removeItem(at: staged)
    }
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
          let mappingPolicyURL = BundledData.bundle.url(
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
    var verifiedInstalls: [FrequencyPackID: FrequencyPackArtifact] = [:]
    let validatedRecords: [FrequencyPackID: InstalledFrequencyPackRecord] = Dictionary(
      uniqueKeysWithValues: (saved?.installedRecords ?? []).compactMap { record in
        guard let manifest = catalog.packs.first(where: { $0.packID == record.packID }),
          !manifest.bundled,
          let artifact = Self.verifiedInstall(
            record,
            manifest: manifest,
            trustedManifests: catalog.allTrustedManifests,
            at: Self.artifactURL(for: record.packID, in: storageDirectory)
          )
        else { return nil }
        verifiedInstalls[record.packID] = artifact
        return (record.packID, record)
      })
    verifiedArtifacts.merge(verifiedInstalls) { _, installed in installed }
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
    lists.publish(
      Self.enabledLists(
        enabledPackIDs, of: catalog, installed: validatedRecords, verified: verifiedArtifacts))
  }

  private static let stagedExtension = "staged"

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

  func download(_ packID: FrequencyPackID, progress: @escaping Progress = { _ in }) async throws {
    guard let manifest = catalog.packs.first(where: { $0.packID == packID }), !manifest.bundled
    else { throw FrequencyPackError.invalidPack }
    failures[packID] = nil
    do {
      let source = try await downloadSource(manifest.downloadURL, progress)
      try Task.checkCancellation()
      progress(1)
      guard source.count == manifest.sourceBytes, source.sha256 == manifest.sourceSHA256 else {
        throw FrequencyPackError.checksumMismatch
      }
      let installed = artifactURL(for: manifest)
      let staged = installed.appendingPathExtension(Self.stagedExtension)
      defer { try? FileManager.default.removeItem(at: staged) }
      let record = try FrequencyPackInstaller.install(
        source: source,
        manifest: manifest,
        languageDataURL: languageDataURL,
        destination: staged
      )
      var changed = packs
      changed.verified[packID] = try FrequencyPackArtifact(url: staged, manifest: manifest)
        .moved(to: installed)
      if changed.installed[packID] == nil, !changed.enabled.contains(packID) {
        changed.enabled.append(packID)
      }
      changed.installed[packID] = record
      try publishLists(changed) {
        if FileManager.default.fileExists(atPath: installed.path) {
          _ = try FileManager.default.replaceItemAt(installed, withItemAt: staged)
        } else {
          try FileManager.default.moveItem(at: staged, to: installed)
        }
      }
      try persist()
    } catch {
      guard !Self.isCancellation(error) else { throw error }
      CrashReporter.record(error, in: .frequencyPack, details: ["pack": packID.rawValue])
      failures[packID] =
        error as? FrequencyPackError == .checksumMismatch
        ? "Downloaded file failed checksum validation."
        : "Download or validation failed. Try again."
      throw error
    }
  }

  private static func isCancellation(_ error: Error) -> Bool {
    error is CancellationError || (error as? URLError)?.code == .cancelled
  }

  func enable(_ packID: FrequencyPackID) throws {
    guard let manifest = catalog.packs.first(where: { $0.packID == packID }) else {
      throw FrequencyPackError.packNotInstalled
    }
    let installedIsValid =
      installedRecords[packID].map {
        Self.verifiedInstall(
          $0,
          manifest: manifest,
          trustedManifests: catalog.allTrustedManifests,
          at: artifactURL(for: manifest)
        ) != nil
      } ?? false
    guard manifest.bundled || installedIsValid else { throw FrequencyPackError.packNotInstalled }
    let installedManifest = effectiveManifest(for: manifest)
    let artifact = try FrequencyPackArtifact(
      url: artifactURL(for: manifest), manifest: installedManifest)
    try artifact.validateSmokeTest()
    verifiedArtifacts[packID] = artifact
    guard !enabledPackIDs.contains(packID) else { return }
    enabledPackIDs.append(packID)
    publishLists()
    try persist()
  }

  func disable(_ packID: FrequencyPackID) throws {
    enabledPackIDs.removeAll { $0 == packID }
    publishLists()
    try persist()
  }

  func reorderEnabled(_ packIDs: [FrequencyPackID]) throws {
    guard packIDs.count == enabledPackIDs.count, Set(packIDs) == Set(enabledPackIDs) else {
      throw FrequencyPackError.invalidPack
    }
    enabledPackIDs = packIDs
    publishLists()
    try persist()
  }

  func remove(_ packID: FrequencyPackID) throws {
    guard let manifest = catalog.packs.first(where: { $0.packID == packID }), manifest.removable
    else { throw FrequencyPackError.packNotRemovable }
    var changed = packs
    changed.enabled.removeAll { $0 == packID }
    changed.installed[packID] = nil
    changed.verified[packID] = nil
    try publishLists(changed) {
      if FileManager.default.fileExists(atPath: artifactURL(for: manifest).path) {
        try FileManager.default.removeItem(at: artifactURL(for: manifest))
      }
    }
    failures[packID] = nil
    try persist()
  }

  private func publishLists() {
    lists.publish(
      Self.enabledLists(
        enabledPackIDs, of: catalog, installed: installedRecords, verified: verifiedArtifacts))
  }

  private typealias Packs = (
    enabled: [FrequencyPackID], installed: [FrequencyPackID: InstalledFrequencyPackRecord],
    verified: [FrequencyPackID: FrequencyPackArtifact]
  )

  private var packs: Packs { (enabledPackIDs, installedRecords, verifiedArtifacts) }

  private func publishLists(
    _ changed: Packs, afterClosing changeFiles: () throws -> Void
  ) throws {
    try lists.publish(
      Self.enabledLists(
        changed.enabled, of: catalog, installed: changed.installed, verified: changed.verified),
      afterClosing: changeFiles)
    (enabledPackIDs, installedRecords, verifiedArtifacts) = changed
  }

  private static func enabledLists(
    _ enabledPackIDs: [FrequencyPackID], of catalog: FrequencyPackCatalog,
    installed installedRecords: [FrequencyPackID: InstalledFrequencyPackRecord],
    verified verifiedArtifacts: [FrequencyPackID: FrequencyPackArtifact]
  ) -> [EnabledFrequencyList] {
    enabledPackIDs.compactMap { packID in
      guard let catalogManifest = catalog.packs.first(where: { $0.packID == packID }) else {
        return nil
      }
      let manifest = effectiveManifest(
        for: catalogManifest, installed: installedRecords, trusted: catalog.allTrustedManifests)
      guard let artifact = verifiedArtifacts[packID], artifact.manifest == manifest else {
        return EnabledFrequencyList(
          dictionary: manifest.disclosure, file: .unavailable(unverifiedList))
      }
      return EnabledFrequencyList(dictionary: manifest.disclosure, file: .verified(artifact.url))
    }
  }

  private func artifactURL(for manifest: FrequencyPackManifest) -> URL {
    bundledArtifactURLs[manifest.packID]
      ?? Self.artifactURL(for: manifest.packID, in: storageDirectory)
  }

  private func effectiveManifest(for catalogManifest: FrequencyPackManifest)
    -> FrequencyPackManifest
  {
    Self.effectiveManifest(
      for: catalogManifest, installed: installedRecords, trusted: catalog.allTrustedManifests)
  }

  private static func effectiveManifest(
    for catalogManifest: FrequencyPackManifest,
    installed installedRecords: [FrequencyPackID: InstalledFrequencyPackRecord],
    trusted trustedManifests: [FrequencyPackManifest]
  ) -> FrequencyPackManifest {
    guard !catalogManifest.bundled,
      let record = installedRecords[catalogManifest.packID],
      let installedManifest = trustedManifest(for: record, in: trustedManifests)
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

  private static func verifiedInstall(
    _ record: InstalledFrequencyPackRecord,
    manifest: FrequencyPackManifest,
    trustedManifests: [FrequencyPackManifest],
    at url: URL
  ) -> FrequencyPackArtifact? {
    guard let installedManifest = trustedManifest(for: record, in: trustedManifests),
      record.packID == manifest.packID,
      installedManifest.packID == manifest.packID,
      FileManager.default.fileExists(atPath: url.path),
      (try? fileSHA256(url)) == record.artifactSHA256
    else { return nil }
    return validArtifact(at: url, manifest: installedManifest)
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

  private static func validArtifact(
    at url: URL, manifest: FrequencyPackManifest
  ) -> FrequencyPackArtifact? {
    do {
      let artifact = try FrequencyPackArtifact(url: url, manifest: manifest)
      try artifact.validateSmokeTest()
      return artifact
    } catch {
      return nil
    }
  }
}

private struct PersistedFrequencyPackState: Codable {
  let enabledPackIDs: [FrequencyPackID]?
  let activePackID: FrequencyPackID?
  let knownBundledPackIDs: [FrequencyPackID]?
  let installedRecords: [InstalledFrequencyPackRecord]
}
