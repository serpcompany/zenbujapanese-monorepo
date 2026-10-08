import Foundation
import Observation
import OSLog

@MainActor
@Observable
public final class ConversationHistory: ConversationArchiving {
  public nonisolated static let defaultDirectory = FileManager.default.urls(
    for: .applicationSupportDirectory, in: .userDomainMask
  )[0]
  .appending(path: "Zenbu Japanese", directoryHint: .isDirectory)
  .appending(path: "Translate Conversations", directoryHint: .isDirectory)

  public static let shared = ConversationHistory()

  public private(set) var conversations: [Conversation] = []
  public private(set) var sharedOnly: [SharedBookmark] = []
  public private(set) var isLoaded = false
  public var liveConversationID: UUID?
  @ObservationIgnored public var bookmarkObserver: ((BookmarkChange) -> Void)?

  @ObservationIgnored private let store: ConversationFileStore
  @ObservationIgnored private let bookmarkFile: SharedBookmarkFile
  @ObservationIgnored private let now: @MainActor () -> Date
  @ObservationIgnored private var removedBeforeLoad: Set<UUID> = []
  @ObservationIgnored private var lastWrite: Task<Void, Never>?

  public init(
    directory: URL = ConversationHistory.defaultDirectory,
    now: @escaping @MainActor () -> Date = Date.init
  ) {
    let store = ConversationFileStore(directory: directory)
    let bookmarkFile = SharedBookmarkFile(
      fileURL: directory.appending(path: "Synced Bookmarks", directoryHint: .isDirectory)
        .appending(path: "bookmarks.json"))
    self.store = store
    self.bookmarkFile = bookmarkFile
    self.now = now
    lastWrite = Task {
      let loaded = await store.loadAll()
      let shared = await bookmarkFile.load()
      finishLoading(loaded, shared: shared)
    }
  }

  public func conversation(_ id: UUID) -> Conversation? {
    conversations.first { $0.id == id }
  }

  public var saved: [Conversation] {
    conversations.filter { $0.id != liveConversationID }
  }

  public func search(_ query: String) -> [Conversation] {
    saved.filter { $0.matches(query) }
  }

  public var bookmarks: [BookmarkedSentence] {
    (saved.flatMap(\.bookmarks) + sharedOnly.map(\.listed))
      .sorted { $0.bookmarkedAt > $1.bookmarkedAt }
  }

  public func setBookmarked(_ isBookmarked: Bool, sentence id: UUID, in conversationID: UUID?) {
    guard let conversationID else {
      if !isBookmarked, let removed = removeSharedOnly(id) { bookmarkObserver?(.removed(removed)) }
      return
    }
    guard let conversation = conversation(conversationID),
      let place = conversation.place(of: id),
      conversation.turns[place.turn].sentences[place.sentence].isBookmarked != isBookmarked
    else { return }
    let before = conversation.bookmark(at: place)
    mark(conversation, at: place, bookmarkedAt: isBookmarked ? now() : nil)
    if !isBookmarked {
      bookmarkObserver?(.removed(before.shared))
    } else if let marked = self.conversation(conversationID) {
      bookmarkObserver?(.added(marked.bookmark(at: place).shared))
    }
  }

  public func applySynced(_ bookmark: SharedBookmark) {
    guard let found = located(bookmark.id) else {
      sharedOnly.removeAll { $0.id == bookmark.id }
      sharedOnly.append(bookmark)
      return saveSharedOnly()
    }
    mark(found.conversation, at: found.place, bookmarkedAt: bookmark.bookmarkedAt)
  }

  public func applySyncedRemoval(ofBookmark id: UUID) {
    if let found = located(id) {
      mark(found.conversation, at: found.place, bookmarkedAt: nil)
    }
    _ = removeSharedOnly(id)
  }

  public func save(_ conversation: Conversation) {
    if let index = conversations.firstIndex(where: { $0.id == conversation.id }) {
      conversations[index] = conversation
    } else {
      conversations.append(conversation)
      sortNewestFirst()
    }
    enqueue { [store] in await store.write(conversation) }
  }

  public func delete(_ id: UUID) {
    let removedBookmarks = conversation(id)?.bookmarks ?? []
    conversations.removeAll { $0.id == id }
    if !isLoaded { removedBeforeLoad.insert(id) }
    enqueue { [store] in await store.remove(id) }
    for bookmark in removedBookmarks { bookmarkObserver?(.removed(bookmark.shared)) }
  }

  public func deleteAll() {
    for conversation in saved { delete(conversation.id) }
  }

  public func flush() async {
    var finished: Task<Void, Never>?
    while let task = lastWrite, task != finished {
      await task.value
      finished = task
    }
  }

  private func located(_ sentenceID: UUID)
    -> (conversation: Conversation, place: Conversation.SentencePlace)?
  {
    for conversation in conversations {
      if let place = conversation.place(of: sentenceID) { return (conversation, place) }
    }
    return nil
  }

  private func mark(
    _ conversation: Conversation, at place: Conversation.SentencePlace, bookmarkedAt: Date?
  ) {
    var marked = conversation
    let sentence = marked.turns[place.turn].sentences[place.sentence]
    guard sentence.isBookmarked != (bookmarkedAt != nil) || sentence.bookmarkedAt != bookmarkedAt
    else { return }
    marked.turns[place.turn].sentences[place.sentence].isBookmarked = bookmarkedAt != nil
    marked.turns[place.turn].sentences[place.sentence].bookmarkedAt = bookmarkedAt
    save(marked)
  }

  private func removeSharedOnly(_ id: UUID) -> SharedBookmark? {
    guard let index = sharedOnly.firstIndex(where: { $0.id == id }) else { return nil }
    let removed = sharedOnly.remove(at: index)
    saveSharedOnly()
    return removed
  }

  private func saveSharedOnly() {
    let bookmarks = sharedOnly
    enqueue { [bookmarkFile] in await bookmarkFile.write(bookmarks) }
  }

  private func finishLoading(_ loaded: [Conversation], shared: SharedBookmarksLoad) {
    let current = Set(conversations.map(\.id))
    conversations.append(
      contentsOf: loaded.filter { !current.contains($0.id) && !removedBeforeLoad.contains($0.id) })
    sortNewestFirst()
    if case .loaded(let bookmarks) = shared { sharedOnly = bookmarks }
    removedBeforeLoad = []
    isLoaded = true
  }

  private func sortNewestFirst() {
    conversations.sort { $0.startedAt > $1.startedAt }
  }

  private func enqueue(_ operation: @escaping @Sendable () async -> Void) {
    let previous = lastWrite
    lastWrite = Task {
      await previous?.value
      await operation()
    }
  }
}

actor ConversationFileStore {
  private let directory: URL
  private let logger = Logger(
    subsystem: Bundle.main.bundleIdentifier ?? "com.zenbujapanese.dictionary",
    category: "TranslateHistory")

  init(directory: URL) {
    self.directory = directory
  }

  func loadAll() -> [Conversation] {
    let urls =
      (try? FileManager.default.contentsOfDirectory(
        at: directory, includingPropertiesForKeys: nil)) ?? []
    return urls.filter { $0.pathExtension == "json" }.compactMap(load)
  }

  func write(_ conversation: Conversation) {
    do {
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      let data = try JSONEncoder.translatorStore.encode(conversation)
      try data.write(to: fileURL(for: conversation.id), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    } catch {
      logger.error("Couldn't save a conversation: \(error.localizedDescription)")
    }
  }

  func remove(_ id: UUID) {
    do {
      try FileManager.default.removeItem(at: fileURL(for: id))
    } catch CocoaError.fileNoSuchFile {
      return
    } catch {
      logger.error("Couldn't delete a conversation: \(error.localizedDescription)")
    }
  }

  private func load(_ url: URL) -> Conversation? {
    guard let data = try? Data(contentsOf: url),
      let conversation = try? JSONDecoder.translatorStore.decode(Conversation.self, from: data),
      conversation.version <= Conversation.currentVersion,
      url.deletingPathExtension().lastPathComponent == conversation.id.uuidString
    else {
      logger.error("Skipped a conversation file this version can't read: \(url.lastPathComponent)")
      return nil
    }
    return conversation
  }

  private func fileURL(for id: UUID) -> URL {
    directory.appending(path: "\(id.uuidString).json")
  }
}

extension JSONEncoder {
  static var translatorStore: JSONEncoder {
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .millisecondsSince1970
    return encoder
  }
}

extension JSONDecoder {
  static var translatorStore: JSONDecoder {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .millisecondsSince1970
    return decoder
  }
}
