import Foundation

@testable import SearchExperience

extension FrequencyPackManager {
  static func bundled(
    _ catalog: FrequencyPackCatalog, storageDirectory: URL,
    relay: KeptChangeRelay = KeptChangeRelay(), download: @escaping Download,
    quietDownload: Download? = nil
  ) throws -> FrequencyPackManager {
    try FrequencyPackManager(
      catalog: catalog,
      bundledArtifactURLs: try catalog.bundledArtifactURLs(),
      languageDataURL: try FrequencyPackCatalog.languageDataURL(),
      storageDirectory: storageDirectory,
      relay: relay,
      download: download,
      quietDownload: quietDownload
    )
  }

  static func freshInstall(storagePrefix: String) throws -> FrequencyPackManager {
    try bundled(
      FrequencyPackCatalog.bundled(),
      storageDirectory: FileManager.default.temporaryDirectory
        .appending(path: "\(storagePrefix)-\(UUID().uuidString)"),
      download: { _, _ in throw CancellationError() }
    )
  }

  static func started(
    _ start: @escaping @Sendable () throws -> FrequencyPackManager
  ) async throws -> FrequencyPackManager {
    try await withCheckedThrowingContinuation { started in
      DispatchQueue(label: "com.zenbujapanese.tests.frequency-pack-start").async {
        started.resume(with: Result(catching: start))
      }
    }
  }
}
