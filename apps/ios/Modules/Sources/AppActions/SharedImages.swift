import Foundation

public struct SharedImages: Equatable, Sendable {
  public let folder: URL

  public init(folder: URL) {
    self.folder = folder
  }

  public init?(appGroup identifier: String) {
    guard
      let container = FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: identifier)
    else { return nil }
    folder = container.appending(path: "Shared Images", directoryHint: .isDirectory)
  }

  public func newShare() throws -> Share {
    try? FileManager.default.removeItem(at: folder)
    let made = share(UUID())
    try FileManager.default.createDirectory(at: made.folder, withIntermediateDirectories: true)
    return made
  }

  public func share(_ id: UUID) -> Share {
    Share(id: id, folder: folder.appending(path: id.uuidString, directoryHint: .isDirectory))
  }

  static func isOneName(_ name: String) -> Bool {
    !name.isEmpty && name != "." && name != ".." && !name.contains("/")
  }

  public struct Share: Equatable, Sendable {
    public let id: UUID
    public let folder: URL

    public func storeCopy(of file: URL, suggestedName: String?, besides stored: [String]) throws
      -> String
    {
      let name = Self.unique(Self.name(suggestedName, of: file), besides: Set(stored))
      try FileManager.default.copyItem(at: file, to: self.file(name))
      return name
    }

    public func files(named images: [String]) -> [URL] {
      images.filter(SharedImages.isOneName).map(file)
    }

    public func discard() {
      try? FileManager.default.removeItem(at: folder)
    }

    private func file(_ name: String) -> URL {
      folder.appending(path: name, directoryHint: .notDirectory)
    }

    static func name(_ suggested: String?, of file: URL) -> String {
      guard let suggested, !suggested.isEmpty else { return file.lastPathComponent }
      let suffix = file.pathExtension
      let named = !(suggested as NSString).pathExtension.isEmpty
      return named || suffix.isEmpty ? suggested : "\(suggested).\(suffix)"
    }

    static func unique(_ name: String, besides taken: Set<String>) -> String {
      let plain = SharedImages.isOneName(name) ? name : "Image"
      guard taken.contains(plain) else { return plain }
      let stem = (plain as NSString).deletingPathExtension
      let suffix = (plain as NSString).pathExtension
      let numbered = (2...).lazy.map { suffix.isEmpty ? "\(stem) \($0)" : "\(stem) \($0).\(suffix)" }
      return numbered.first { !taken.contains($0) } ?? plain
    }
  }
}
