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
      pack.engine == "sudachi.rs", pack.engineVersion == "0.6.11",
      pack.binding == "sudachi-swift", pack.bindingVersion == "0.1.1",
      pack.packVersion == "20260723",
      pack.downloadBytes == 72_275_897,
      pack.downloadSHA256 == "b3869ce6b12b4bfa09575dc19030703bb669ab41bac12a74cafcbb28c6be2498",
      pack.installedBytes == 217_466_039,
      pack.installedSHA256 == "53fa281d11eef3769712fe1c3c892117338f9892bee6daf4dad51daa5281bb6f",
      pack.runtimeResourceCommit == "90fd6068c80c2fc3b63e0dbab0e341475bad4d8f",
      pack.characterDefinitionSHA256
        == "b549ec56ad67359f535c80b7efa150538af2a78b7609d0d6bae796dd89f4f29d",
      pack.unknownDefinitionSHA256
        == "4e8c4c15e18af6a9fc5d636e3dc73fde55d50941b93a6c8835d4653d3f54ba79",
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
        archiveData.sha256 == manifest.downloadSHA256
      else { throw LanguageTechnologyPackError.checksumMismatch }

      let staging = storageDirectory.appendingPathComponent("staging-\(UUID().uuidString).dic")
      defer { try? FileManager.default.removeItem(at: staging) }
      let archive = try Archive(data: archiveData, accessMode: .read)
      guard let entry = archive[manifest.archiveEntry],
        entry.type == .file,
        entry.uncompressedSize == UInt32(manifest.installedBytes)
      else { throw LanguageTechnologyPackError.invalidArchive }
      _ = try archive.extract(entry, to: staging)
      try Task.checkCancellation()
      guard Self.validDictionary(at: staging, manifest: manifest) else {
        throw LanguageTechnologyPackError.invalidArtifact
      }
      try validateProvider(staging)

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

  static func validateGoldenOutput(dictionaryURL: URL) throws {
    let dictionary = try SudachiRuntimeResources.dictionary(at: dictionaryURL)
    let tokenizer = try SudachiTokenizer(dictionary: dictionary, mode: .c)
    let candidates = try tokenizer.tokenize(text: "日本語を用いる。")
    guard candidates.map(\.surface) == ["日本語", "を", "用いる", "。"],
      candidates[0].dictionaryForm == "日本語",
      candidates[0].readingForm == "ニホンゴ",
      candidates[2].dictionaryForm == "用いる",
      candidates.allSatisfy({ $0.range(in: "日本語を用いる。") != nil })
    else { throw LanguageTechnologyPackError.goldenOutputMismatch }
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
