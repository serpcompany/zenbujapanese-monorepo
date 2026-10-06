import Foundation

@testable import SearchExperience

extension FrequencyPackManager {
  static func bundled(
    _ catalog: FrequencyPackCatalog, storageDirectory: URL, download: @escaping Download
  ) throws -> FrequencyPackManager {
    try FrequencyPackManager(
      catalog: catalog,
      bundledArtifactURLs: try catalog.bundledArtifactURLs(),
      languageDataURL: try FrequencyPackCatalog.languageDataURL(),
      storageDirectory: storageDirectory,
      download: download
    )
  }

  static func freshInstall(storagePrefix: String) throws -> FrequencyPackManager {
    try bundled(
      FrequencyPackCatalog.bundled(),
      storageDirectory: FileManager.default.temporaryDirectory
        .appending(path: "\(storagePrefix)-\(UUID().uuidString)"),
      download: { _ in throw CancellationError() }
    )
  }
}
