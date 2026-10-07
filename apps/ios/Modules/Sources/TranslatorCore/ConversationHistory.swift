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

  public private(set) var conversations: [Conversation] = []
  public private(set) var isLoaded = false
  public var liveConversationID: UUID?

  @ObservationIgnored private let store: ConversationFileStore
  @ObservationIgnored private var removedBeforeLoad: Set<UUID> = []
  @ObservationIgnored private var lastWrite: Task<Void, Never>?

  public init(directory: URL = ConversationHistory.defaultDirectory) {
    store = ConversationFileStore(directory: directory)
    lastWrite = Task { [store] in
      let loaded = await store.loadAll()
      finishLoading(loaded)
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
    saved.flatMap { conversation in
      conversation.turns.flatMap { turn in
        turn.sentences.filter(\.isBookmarked).map {
          BookmarkedSentence(conversationID: conversation.id, language: turn.language, sentence: $0)
        }
      }
    }
  }

  public func setBookmarked(_ isBookmarked: Bool, sentence id: UUID, in conversationID: UUID) {
    guard var conversation = conversation(conversationID) else { return }
    for turn in conversation.turns.indices {
      for sentence in conversation.turns[turn].sentences.indices
      where conversation.turns[turn].sentences[sentence].id == id {
        conversation.turns[turn].sentences[sentence].isBookmarked = isBookmarked
      }
    }
    save(conversation)
  }

  public func save(_ conversation: Conversation) {
    if let index = conversations.firstIndex(where: { $0.id == conversation.id }) {
      conversations[index] = conversation
    } else {
      conversations.append(conversation)
      sortNewestFirst()
    }
    enqueue { await $0.write(conversation) }
  }

  public func delete(_ id: UUID) {
    conversations.removeAll { $0.id == id }
    if !isLoaded { removedBeforeLoad.insert(id) }
    enqueue { await $0.remove(id) }
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

  private func finishLoading(_ loaded: [Conversation]) {
    let current = Set(conversations.map(\.id))
    conversations.append(
      contentsOf: loaded.filter { !current.contains($0.id) && !removedBeforeLoad.contains($0.id) })
    sortNewestFirst()
    removedBeforeLoad = []
    isLoaded = true
  }

  private func sortNewestFirst() {
    conversations.sort { $0.startedAt > $1.startedAt }
  }

  private func enqueue(_ operation: @escaping @Sendable (ConversationFileStore) async -> Void) {
    let previous = lastWrite
    lastWrite = Task { [store] in
      await previous?.value
      await operation(store)
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
      let data = try Self.encoder.encode(conversation)
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
      let conversation = try? Self.decoder.decode(Conversation.self, from: data),
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

  private static var encoder: JSONEncoder {
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .millisecondsSince1970
    return encoder
  }

  private static var decoder: JSONDecoder {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .millisecondsSince1970
    return decoder
  }
}
