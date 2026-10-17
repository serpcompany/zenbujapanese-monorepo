import Foundation
import OSLog

public struct SharedBookmark: Codable, Sendable, Hashable, Identifiable {
  public let id: UUID
  public var text: String
  public var translation: String?
  public var language: SpokenLanguage
  public var bookmarkedAt: Date

  public init(
    id: UUID, text: String, translation: String?, language: SpokenLanguage, bookmarkedAt: Date
  ) {
    self.id = id
    self.text = text
    self.translation = translation
    self.language = language
    self.bookmarkedAt = bookmarkedAt
  }

  var listed: BookmarkedSentence {
    BookmarkedSentence(
      conversationID: nil, language: language,
      sentence: TranslatedSentence(
        id: id, text: text, translation: translation, isBookmarked: true,
        bookmarkedAt: bookmarkedAt),
      bookmarkedAt: bookmarkedAt)
  }
}

public enum BookmarkChange: Sendable, Equatable {
  case added(SharedBookmark)
  case removed(SharedBookmark)
}

public enum SharedBookmarksProblem: Sendable, Equatable {
  case couldNotRead
  case newerVersion
}

enum SharedBookmarksLoad: Sendable {
  case loaded([SharedBookmark])
  case keptAside(SharedBookmarksProblem)
}

actor SharedBookmarkFile {
  private struct StoredFile: Codable {
    static let currentVersion = 1
    var version = currentVersion
    var bookmarks: [SharedBookmark]
  }

  private struct VersionProbe: Decodable {
    let version: Int
  }

  private let fileURL: URL
  private var writable = true
  private let logger = Logger(
    subsystem: Bundle.main.bundleIdentifier ?? "com.zenbujapanese.dictionary",
    category: "TranslateBookmarks")

  init(fileURL: URL) {
    self.fileURL = fileURL
  }

  func load() -> SharedBookmarksLoad {
    let data: Data
    do {
      data = try Data(contentsOf: fileURL)
    } catch CocoaError.fileReadNoSuchFile {
      return .loaded([])
    } catch {
      writable = false
      logger.error("Couldn't read synced bookmarks: \(error.localizedDescription)")
      return .keptAside(.couldNotRead)
    }
    let decoder = JSONDecoder.translatorStore
    if let stored = try? decoder.decode(StoredFile.self, from: data),
      stored.version <= StoredFile.currentVersion
    {
      return .loaded(stored.bookmarks)
    }
    writable = false
    let version = (try? decoder.decode(VersionProbe.self, from: data))?.version
    logger.error(
      "Left a synced bookmarks file this version can't read in place (version \(version ?? -1))")
    return .keptAside((version ?? 0) > StoredFile.currentVersion ? .newerVersion : .couldNotRead)
  }

  func write(_ bookmarks: [SharedBookmark]) {
    guard writable else { return }
    do {
      try FileManager.default.createDirectory(
        at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
      let data = try JSONEncoder.translatorStore.encode(StoredFile(bookmarks: bookmarks))
      try data.write(
        to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    } catch {
      logger.error("Couldn't save synced bookmarks: \(error.localizedDescription)")
    }
  }
}
