import CryptoKit
import Foundation
import Sudachi
import ZIPFoundation

struct LanguageTechnologyPackID: Codable, Hashable, RawRepresentable, Sendable {
  let rawValue: String

  init(rawValue: String) { self.rawValue = rawValue }

  init(from decoder: Decoder) throws {
    rawValue = try decoder.singleValueContainer().decode(String.self)
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    try container.encode(rawValue)
  }
}

struct LanguageTechnologyPackCatalog: Codable, Equatable, Sendable {
  let schemaVersion: Int
  let packs: [LanguageTechnologyPackManifest]
  let trustedHistoricalManifests: [LanguageTechnologyPackManifest]

  var allTrustedManifests: [LanguageTechnologyPackManifest] {
    packs + trustedHistoricalManifests
  }

  static func bundled() throws -> Self {
    guard
      let url = Bundle.module.url(
        forResource: "LanguageTechnologyPackCatalog", withExtension: "json")
    else { throw LanguageTechnologyPackError.invalidCatalog }
    let catalog = try JSONDecoder().decode(Self.self, from: Data(contentsOf: url))
    let bundledDefaults = catalog.packs.filter { $0.distribution == .bundledDefault }
    guard catalog.schemaVersion == 1, bundledDefaults.count == 1,
      let pack = bundledDefaults.first,
      pack.packID.rawValue == "sudachi-core-ja-20260723",
      pack.engine == SudachiCoreContract.engine,
      pack.engineVersion == SudachiCoreContract.engineVersion,
      pack.binding == SudachiCoreContract.binding,
      pack.bindingVersion == SudachiCoreContract.bindingVersion,
      pack.packVersion == SudachiCoreContract.dictionaryVersion,
      pack.downloadBytes == SudachiCoreContract.downloadBytes,
      pack.downloadSHA256 == SudachiCoreContract.downloadSHA256,
      pack.downloadURL == SudachiCoreContract.downloadURL,
      pack.installedBytes == SudachiCoreContract.installedBytes,
      pack.archiveEntry == SudachiCoreContract.archiveEntry,
      pack.installedSHA256 == SudachiCoreContract.dictionarySHA256,
      pack.runtimeResourceCommit == SudachiCoreContract.runtimeResourceCommit,
      pack.characterDefinitionSHA256 == SudachiCoreContract.characterDefinitionSHA256,
      pack.unknownDefinitionSHA256 == SudachiCoreContract.unknownDefinitionSHA256,
      pack.bundledResource == "system_core",
      pack.bundledResourceExtension == "dic",
      Bundle.module.url(forResource: pack.licenseResource, withExtension: "txt") != nil,
      catalog.trustedHistoricalManifests.allSatisfy({ historical in
        catalog.packs.contains { $0.packID == historical.packID }
      })
    else { throw LanguageTechnologyPackError.invalidCatalog }
    return catalog
  }
}

struct LanguageTechnologyPackManifest: Codable, Equatable, Sendable {
  let packID: LanguageTechnologyPackID
  let displayName: String
  let packVersion: String
  let engine: String
  let engineVersion: String
  let binding: String
  let bindingVersion: String
  let splitPolicy: String
  let downloadURL: URL
  let downloadBytes: Int
  let downloadSHA256: String
  let archiveEntry: String
  let installedBytes: Int
  let installedSHA256: String
  let runtimeResourceCommit: String
  let characterDefinitionSHA256: String
  let unknownDefinitionSHA256: String
  let licenseIdentifier: String
  let attribution: String
  let licenseResource: String
  let distribution: LanguageTechnologyPackDistribution
  let bundledResource: String?
  let bundledResourceExtension: String?
}

enum LanguageTechnologyPackDistribution: String, Codable, Equatable, Sendable {
  case bundledDefault
  case optionalDownload
}

struct LanguageTechnologyPackSnapshot: Equatable, Sendable {
  let packs: [LanguageTechnologyPackState]
}

struct LanguageTechnologyPackState: Equatable, Identifiable, Sendable {
  var id: LanguageTechnologyPackID { manifest.packID }
  let manifest: LanguageTechnologyPackManifest
  let isInstalled: Bool
  let isActive: Bool
  let installedVersion: String?
  let installedBytes: Int?
  let failureMessage: String?
  let updateAvailable: Bool
  let isIncludedWithApp: Bool
  let worksOffline: Bool
  let canDownload: Bool
  let canRemove: Bool

  var status: LanguageTechnologyPackStatus {
    if isActive { return .active }
    if isIncludedWithApp && !worksOffline { return .unavailable }
    return .available
  }
}

enum LanguageTechnologyPackStatus: Equatable, Sendable {
  case active
  case available
  case unavailable

  var title: String {
    switch self {
    case .active: "Active"
    case .available: "Available"
    case .unavailable: "Unavailable"
    }
  }

  var systemImage: String {
    switch self {
    case .active: "checkmark.circle.fill"
    case .available: "arrow.down.circle"
    case .unavailable: "exclamationmark.triangle"
    }
  }

  var accessibilityValue: String {
    switch self {
    case .active: "Ready for on-device analysis"
    case .available: "Not installed"
    case .unavailable: "Included resources failed verification"
    }
  }
}

enum LanguageTechnologyPackError: Error, Equatable {
  case invalidCatalog
  case invalidPack
  case checksumMismatch
  case invalidArchive
  case invalidArtifact
  case goldenOutputMismatch
  case packNotInstalled
}

private struct InstalledLanguageTechnologyPack: Codable, Equatable {
  let packID: LanguageTechnologyPackID
  let packVersion: String
  let downloadSHA256: String
  let installedSHA256: String
  let filename: String
}

actor LanguageTechnologyPackManager {
  typealias Download = @Sendable (URL) async throws -> Data

  private let catalog: LanguageTechnologyPackCatalog
  private let storageDirectory: URL
  private let downloadSource: Download
  private let validateProvider: @Sendable (URL) throws -> Void
  private let bundledDefault: (manifest: LanguageTechnologyPackManifest, url: URL)?
  private var installedOverride: InstalledLanguageTechnologyPack?
  private var failureMessage: String?
  private var failurePackID: LanguageTechnologyPackID?

  init(
    catalog: LanguageTechnologyPackCatalog,
    storageDirectory: URL,
    bundledDictionaryURL: URL? = nil,
    download: @escaping Download,
    validateProvider: @escaping @Sendable (URL) throws -> Void =
      LanguageTechnologyPackManager.validateGoldenOutput
  ) throws {
    self.catalog = catalog
    self.storageDirectory = storageDirectory
    downloadSource = download
    self.validateProvider = validateProvider
    let bundledManifest = catalog.packs.first { $0.distribution == .bundledDefault }
    let resolvedBundledURL =
      bundledDictionaryURL
      ?? bundledManifest.flatMap { manifest in
        guard let resource = manifest.bundledResource,
          let resourceExtension = manifest.bundledResourceExtension
        else { return nil }
        return Bundle.module.url(forResource: resource, withExtension: resourceExtension)
          ?? Bundle.main.url(forResource: resource, withExtension: resourceExtension)
      }
    if let manifest = bundledManifest, let url = resolvedBundledURL,
      Self.validDictionary(at: url, manifest: manifest),
      (try? validateProvider(url)) != nil
    {
      bundledDefault = (manifest, url)
    } else {
      bundledDefault = nil
      if bundledManifest != nil {
        failureMessage = "The included Japanese analysis resources could not be verified."
        failurePackID = bundledManifest?.packID
      }
    }

    let stateURL = storageDirectory.appendingPathComponent("state.json")
    if let record = try? JSONDecoder().decode(
      InstalledLanguageTechnologyPack.self, from: Data(contentsOf: stateURL))
    {
      let manifest = catalog.allTrustedManifests.first {
        $0.packID == record.packID && $0.packVersion == record.packVersion
      }
      let dictionaryURL = storageDirectory.appendingPathComponent(record.filename)
      let isValid =
        manifest.map {
          Self.isManagedFilename(record.filename)
            && record.downloadSHA256 == $0.downloadSHA256
            && record.installedSHA256 == $0.installedSHA256
            && Self.validDictionary(at: dictionaryURL, manifest: $0)
            && (try? validateProvider(dictionaryURL)) != nil
        } ?? false
      if let manifest, isValid {
        if manifest.distribution == .bundledDefault,
          bundledDefault?.manifest.packID == manifest.packID,
          bundledDefault?.manifest.installedSHA256 == record.installedSHA256
        {
          do {
            try FileManager.default.removeItem(at: dictionaryURL)
            try FileManager.default.removeItem(at: stateURL)
            if try FileManager.default.contentsOfDirectory(atPath: storageDirectory.path).isEmpty {
              try FileManager.default.removeItem(at: storageDirectory)
            }
          } catch {
            failureMessage =
              "The included Japanese analysis is active, but an older verified pack could not be removed."
            failurePackID = manifest.packID
          }
        } else if manifest.distribution == .optionalDownload {
          installedOverride = record
        }
      } else if manifest?.distribution == .optionalDownload {
        failureMessage =
          "An optional Japanese analysis pack could not be verified. Zenbu is using the included pack."
        failurePackID = record.packID
      }
    }
  }

  func snapshot() -> LanguageTechnologyPackSnapshot {
    LanguageTechnologyPackSnapshot(
      packs: catalog.packs.map { manifest in
        let isBundled = manifest.distribution == .bundledDefault
        let bundleAvailable = bundledDefault?.manifest.packID == manifest.packID
        let overrideInstalled = installedOverride?.packID == manifest.packID
        let isActive = overrideInstalled || (installedOverride == nil && bundleAvailable)
        return LanguageTechnologyPackState(
          manifest: manifest,
          isInstalled: bundleAvailable || overrideInstalled,
          isActive: isActive,
          installedVersion: installedOverride.flatMap {
            $0.packID == manifest.packID ? $0.packVersion : nil
          } ?? (bundleAvailable ? manifest.packVersion : nil),
          installedBytes: installedOverride.flatMap { record in
            guard record.packID == manifest.packID else { return nil }
            let url = storageDirectory.appendingPathComponent(record.filename)
            return try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize
          } ?? (bundleAvailable ? manifest.installedBytes : nil),
          failureMessage: failurePackID == manifest.packID ? failureMessage : nil,
          updateAvailable: installedOverride.map {
            $0.packID == manifest.packID && $0.packVersion != manifest.packVersion
          } ?? false,
          isIncludedWithApp: isBundled,
          worksOffline: bundleAvailable || overrideInstalled,
          canDownload: !isBundled && !overrideInstalled,
          canRemove: !isBundled && overrideInstalled
        )
      }
    )
  }

  func download(_ packID: LanguageTechnologyPackID) async throws {
    guard
      let manifest = catalog.packs.first(where: {
        $0.packID == packID && $0.distribution == .optionalDownload
      })
    else {
      throw LanguageTechnologyPackError.invalidPack
    }
    failureMessage = nil
    failurePackID = nil
    do {
      try FileManager.default.createDirectory(
        at: storageDirectory, withIntermediateDirectories: true)
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      var mutableStorageDirectory = storageDirectory
      try? mutableStorageDirectory.setResourceValues(values)
      try Task.checkCancellation()
      let archiveData = try await downloadSource(manifest.downloadURL)
      try Task.checkCancellation()
      guard archiveData.count == manifest.downloadBytes,
        try Self.cancellableSHA256(archiveData) == manifest.downloadSHA256
      else { throw LanguageTechnologyPackError.checksumMismatch }

      let staging = storageDirectory.appendingPathComponent("staging-\(UUID().uuidString).dic")
      defer { try? FileManager.default.removeItem(at: staging) }
      let archive = try Archive(data: archiveData, accessMode: .read)
      guard let entry = archive[manifest.archiveEntry],
        entry.type == .file,
        entry.uncompressedSize == UInt32(manifest.installedBytes)
      else { throw LanguageTechnologyPackError.invalidArchive }
      let extractionProgress = Progress()
      _ = try await withTaskCancellationHandler {
        try archive.extract(entry, to: staging, progress: extractionProgress)
      } onCancel: {
        extractionProgress.cancel()
      }
      try Task.checkCancellation()
      guard
        (try? staging.resourceValues(forKeys: [.fileSizeKey]).fileSize)
          == manifest.installedBytes,
        try Self.cancellableFileSHA256(staging) == manifest.installedSHA256
      else {
        throw LanguageTechnologyPackError.invalidArtifact
      }
      try validateProvider(staging)
      try Task.checkCancellation()

      let filename =
        "\(manifest.packID.rawValue)-\(manifest.packVersion)-\(UUID().uuidString).dic"
      let destination = storageDirectory.appendingPathComponent(filename)
      try FileManager.default.moveItem(at: staging, to: destination)
      let record = InstalledLanguageTechnologyPack(
        packID: packID,
        packVersion: manifest.packVersion,
        downloadSHA256: manifest.downloadSHA256,
        installedSHA256: manifest.installedSHA256,
        filename: filename
      )
      do {
        try Task.checkCancellation()
        try JSONEncoder().encode(record).write(
          to: storageDirectory.appendingPathComponent("state.json"), options: .atomic)
      } catch {
        try? FileManager.default.removeItem(at: destination)
        throw error
      }
      let previous = installedOverride
      installedOverride = record
      if let previous, previous.filename != filename {
        try? FileManager.default.removeItem(
          at: storageDirectory.appendingPathComponent(previous.filename))
      }
    } catch {
      failureMessage =
        error is CancellationError
        ? nil : "Download or validation failed. Your last verified pack was kept."
      failurePackID = error is CancellationError ? nil : packID
      throw error
    }
  }

  func remove(_ packID: LanguageTechnologyPackID) throws {
    guard let record = installedOverride, record.packID == packID else {
      throw LanguageTechnologyPackError.packNotInstalled
    }
    try FileManager.default.removeItem(at: storageDirectory.appendingPathComponent(record.filename))
    try? FileManager.default.removeItem(at: storageDirectory.appendingPathComponent("state.json"))
    installedOverride = nil
    failureMessage = nil
    failurePackID = nil
  }

  func installedDictionaryURL() -> URL? {
    if let record = installedOverride {
      let url = storageDirectory.appendingPathComponent(record.filename)
      if FileManager.default.fileExists(atPath: url.path) { return url }
    }
    return bundledDefault?.url
  }

  private static func isManagedFilename(_ filename: String) -> Bool {
    !filename.isEmpty && filename == URL(fileURLWithPath: filename).lastPathComponent
  }

  private static func validDictionary(
    at url: URL,
    manifest: LanguageTechnologyPackManifest
  ) -> Bool {
    guard let values = try? url.resourceValues(forKeys: [.fileSizeKey]),
      values.fileSize == manifest.installedBytes,
      let data = try? Data(contentsOf: url, options: .mappedIfSafe)
    else { return false }
    return data.sha256 == manifest.installedSHA256
  }

  private static func cancellableSHA256(_ data: Data) throws -> String {
    var digest = SHA256()
    let chunkSize = 4 * 1_024 * 1_024
    var offset = 0
    while offset < data.count {
      try Task.checkCancellation()
      let end = min(offset + chunkSize, data.count)
      digest.update(data: data[offset..<end])
      offset = end
    }
    return digest.finalize().map { String(format: "%02x", $0) }.joined()
  }

  private static func cancellableFileSHA256(_ url: URL) throws -> String {
    let handle = try FileHandle(forReadingFrom: url)
    defer { try? handle.close() }
    var digest = SHA256()
    while true {
      try Task.checkCancellation()
      let chunk = try handle.read(upToCount: 4 * 1_024 * 1_024) ?? Data()
      if chunk.isEmpty { break }
      digest.update(data: chunk)
    }
    return digest.finalize().map { String(format: "%02x", $0) }.joined()
  }

  static func validateGoldenOutput(dictionaryURL: URL) throws {
    do {
      let analysis = try SudachiJapaneseMorphologyAdapter(dictionaryURL: dictionaryURL)
        .analyze("日本語を用いる。")
      try SudachiCoreContract.validateGoldenOutput(analysis)
    } catch {
      throw LanguageTechnologyPackError.goldenOutputMismatch
    }
  }
}

struct LanguageTechnologyPackClient: Sendable {
  var snapshot: @Sendable () async throws -> LanguageTechnologyPackSnapshot
  var download: @Sendable (LanguageTechnologyPackID) async throws -> Void
  var remove: @Sendable (LanguageTechnologyPackID) async throws -> Void

  static let live = LanguageTechnologyPackClient(
    snapshot: { try await LanguageTechnologyPackStore.shared.snapshot() },
    download: { try await LanguageTechnologyPackStore.shared.download($0) },
    remove: { try await LanguageTechnologyPackStore.shared.remove($0) }
  )
}

actor LanguageTechnologyPackStore {
  static let shared = LanguageTechnologyPackStore()
  private let manager: LanguageTechnologyPackManager?

  init() {
    let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[
      0]
    let directory = support.appendingPathComponent("LanguageTechnologyPacks", isDirectory: true)
    #if DEBUG
      if ProcessInfo.processInfo.arguments.contains("-ResetLanguageTechnologyPacks") {
        try? FileManager.default.removeItem(at: directory)
      }
    #endif
    manager = try? LanguageTechnologyPackManager(
      catalog: .bundled(),
      storageDirectory: directory,
      download: { url in
        let (data, response) = try await URLSession.shared.data(from: url)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
          throw LanguageTechnologyPackError.invalidArtifact
        }
        return data
      }
    )
  }

  func snapshot() async throws -> LanguageTechnologyPackSnapshot {
    guard let manager else { throw LanguageTechnologyPackError.invalidCatalog }
    return await manager.snapshot()
  }

  func download(_ id: LanguageTechnologyPackID) async throws {
    guard let manager else { throw LanguageTechnologyPackError.invalidCatalog }
    try await manager.download(id)
    await JapaneseMorphologyStore.shared.invalidate()
  }

  func remove(_ id: LanguageTechnologyPackID) async throws {
    guard let manager else { throw LanguageTechnologyPackError.invalidCatalog }
    try await manager.remove(id)
    await JapaneseMorphologyStore.shared.invalidate()
  }

  func installedDictionaryURL() async -> URL? {
    await manager?.installedDictionaryURL()
  }

  #if DEBUG
    func ensureInstalledForTesting() async {
      guard let manager, let pack = await manager.snapshot().packs.first, !pack.isInstalled else {
        return
      }
      try? await download(pack.id)
    }
  #endif
}
