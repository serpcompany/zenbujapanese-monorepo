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
      else { return nil }
      let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        .appending(path: "ImageTextFixtures", directoryHint: .isDirectory)
      let sources = fixtureNames.compactMap { name in
        Bundle.main.url(
          forResource: String(name.dropLast(4)),
          withExtension: "png",
          subdirectory: "ImageTextFixtures"
        )
      }
      guard sources.count == fixtureNames.count else { return nil }
      do {
        try prepareCopies(from: sources, in: directory)
        return directory
      } catch {
        return nil
      }
    }

    static func prepareCopies(from sources: [URL], in directory: URL) throws {
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      for source in sources {
        let destination = directory.appending(path: source.lastPathComponent)
        let bytes = try Data(contentsOf: source)
        // SwiftUI can initialize the root again while Files is reading these
        // URLs. Preserve unchanged files so active references keep their identity.
        if FileManager.default.fileExists(atPath: destination.path),
          try Data(contentsOf: destination) == bytes
        {
          continue
        }
        try bytes.write(to: destination, options: .atomic)
      }
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

  }
#endif
