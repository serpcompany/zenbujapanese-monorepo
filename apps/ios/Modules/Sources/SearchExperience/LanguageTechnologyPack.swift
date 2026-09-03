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
    guard catalog.schemaVersion == 1, catalog.packs.count == 1,
      let pack = catalog.packs.first,
      pack.packID.rawValue == "sudachi-core-ja-20260723",
      pack.engine == SudachiCoreContract.engine,
      pack.engineVersion == SudachiCoreContract.engineVersion,
      pack.binding == SudachiCoreContract.binding,
      pack.bindingVersion == SudachiCoreContract.bindingVersion,
      pack.packVersion == SudachiCoreContract.dictionaryVersion,
      pack.downloadBytes == SudachiCoreContract.downloadBytes,
      pack.downloadSHA256 == SudachiCoreContract.downloadSHA256,
      pack.installedBytes == SudachiCoreContract.installedBytes,
      pack.archiveEntry == SudachiCoreContract.archiveEntry,
      pack.installedSHA256 == SudachiCoreContract.dictionarySHA256,
      pack.runtimeResourceCommit == SudachiCoreContract.runtimeResourceCommit,
      pack.characterDefinitionSHA256 == SudachiCoreContract.characterDefinitionSHA256,
      pack.unknownDefinitionSHA256 == SudachiCoreContract.unknownDefinitionSHA256,
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
  private var installed: InstalledLanguageTechnologyPack?
  private var failureMessage: String?

  init(
    catalog: LanguageTechnologyPackCatalog,
    storageDirectory: URL,
    download: @escaping Download,
    validateProvider: @escaping @Sendable (URL) throws -> Void =
      LanguageTechnologyPackManager.validateGoldenOutput
  ) throws {
    self.catalog = catalog
    self.storageDirectory = storageDirectory
    downloadSource = download
    self.validateProvider = validateProvider
    try FileManager.default.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    var mutableStorageDirectory = storageDirectory
    try? mutableStorageDirectory.setResourceValues(values)
    let stateURL = storageDirectory.appendingPathComponent("state.json")
    if let record = try? JSONDecoder().decode(
      InstalledLanguageTechnologyPack.self, from: Data(contentsOf: stateURL)),
      let manifest = catalog.allTrustedManifests.first(where: {
        $0.packID == record.packID && $0.packVersion == record.packVersion
      }),
      record.downloadSHA256 == manifest.downloadSHA256,
      record.installedSHA256 == manifest.installedSHA256,
      Self.validDictionary(
        at: storageDirectory.appendingPathComponent(record.filename), manifest: manifest),
      (try? validateProvider(storageDirectory.appendingPathComponent(record.filename))) != nil
    {
      installed = record
    }
  }

  func snapshot() -> LanguageTechnologyPackSnapshot {
    LanguageTechnologyPackSnapshot(
      packs: catalog.packs.map { manifest in
        LanguageTechnologyPackState(
          manifest: manifest,
          isInstalled: installed?.packID == manifest.packID,
          isActive: installed?.packID == manifest.packID,
          installedVersion: installed.flatMap {
            $0.packID == manifest.packID ? $0.packVersion : nil
          },
          installedBytes: installed.flatMap { record in
            guard record.packID == manifest.packID else { return nil }
            let url = storageDirectory.appendingPathComponent(record.filename)
            return try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize
          },
          failureMessage: failureMessage,
          updateAvailable: installed.map {
            $0.packID == manifest.packID && $0.packVersion != manifest.packVersion
          } ?? false
        )
      }
    )
  }

  func download(_ packID: LanguageTechnologyPackID) async throws {
    guard let manifest = catalog.packs.first(where: { $0.packID == packID }) else {
      throw LanguageTechnologyPackError.invalidPack
    }
    failureMessage = nil
    do {
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
      let previous = installed
      installed = record
      if let previous, previous.filename != filename {
        try? FileManager.default.removeItem(
          at: storageDirectory.appendingPathComponent(previous.filename))
      }
    } catch {
      failureMessage =
        error is CancellationError
        ? nil : "Download or validation failed. Your last verified pack was kept."
      throw error
    }
  }

  func remove(_ packID: LanguageTechnologyPackID) throws {
    guard let record = installed, record.packID == packID else {
      throw LanguageTechnologyPackError.packNotInstalled
    }
    try FileManager.default.removeItem(at: storageDirectory.appendingPathComponent(record.filename))
    try? FileManager.default.removeItem(at: storageDirectory.appendingPathComponent("state.json"))
    installed = nil
    failureMessage = nil
  }

  func installedDictionaryURL() -> URL? {
    guard let record = installed else { return nil }
    let url = storageDirectory.appendingPathComponent(record.filename)
    return FileManager.default.fileExists(atPath: url.path) ? url : nil
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
