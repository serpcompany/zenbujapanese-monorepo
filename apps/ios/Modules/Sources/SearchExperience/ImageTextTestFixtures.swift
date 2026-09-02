#if DEBUG
  import Foundation

  @MainActor
  enum ImageTextTestFixtures {
    private static let fixtureNames = [
      "fixture-clear-horizontal.png",
      "fixture-vertical.png",
      "fixture-sparse.png",
      "fixture-noisy-horizontal.png",
      "fixture-empty.png",
    ]

    static func prepareIfRequested() -> URL? {
      let arguments = ProcessInfo.processInfo.arguments
      guard
        arguments.contains("-PrepareImageTextFixtures")
          || arguments.contains("-StartImageTextFixtures")
          || arguments.contains("-ExportImageTextFixtures")
      else { return nil }
      let directory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        .appending(path: "Image Text Fixtures", directoryHint: .isDirectory)
      try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      for name in fixtureNames {
        guard
          let source = Bundle.main.url(
            forResource: String(name.dropLast(4)),
            withExtension: "png",
            subdirectory: "ImageTextFixtures"
          )
        else { continue }
        let destination = directory.appending(path: name)
        try? FileManager.default.removeItem(at: destination)
        try? FileManager.default.copyItem(at: source, to: destination)
      }
      return directory
    }

    static func sessionFromProcessArguments(in directory: URL?) -> ImageTextSession? {
      let arguments = ProcessInfo.processInfo.arguments
      guard let marker = arguments.firstIndex(of: "-StartImageTextFixtures"),
        arguments.indices.contains(marker + 1), let directory
      else { return nil }
      let assets = arguments[marker + 1].split(separator: ",").compactMap {
        name -> ImageTextAsset? in
        let url = directory.appending(path: String(name))
        guard let data = try? Data(contentsOf: url) else { return nil }
        return ImageTextAsset(name: String(name), data: data)
      }
      return assets.isEmpty ? nil : ImageTextSession(assets: assets)
    }

    static func exportURLsFromProcessArguments(in directory: URL?) -> [URL] {
      let arguments = ProcessInfo.processInfo.arguments
      guard let marker = arguments.firstIndex(of: "-ExportImageTextFixtures"),
        arguments.indices.contains(marker + 1), let directory
      else { return [] }
      return arguments[marker + 1].split(separator: ",").map {
        directory.appending(path: String($0))
      }
    }

  }
#endif
