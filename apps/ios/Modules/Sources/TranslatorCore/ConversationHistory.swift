import Foundation
import Observation
import OSLog

public enum HistoryRetention: String, CaseIterable, Sendable, Identifiable {
  case thirtyDays
  case oneYear
  case forever

  public var id: Self { self }

  public func cutoff(before now: Date, calendar: Calendar = .current) -> Date? {
    switch self {
    case .thirtyDays: calendar.date(byAdding: .day, value: -30, to: now)
    case .oneYear: calendar.date(byAdding: .year, value: -1, to: now)
    case .forever: nil
    }
  }
}

@MainActor
@Observable
public final class ConversationHistory: ConversationArchiving {
  public nonisolated static let defaultDirectory = FileManager.default.urls(
    for: .applicationSupportDirectory, in: .userDomainMask
  )[0]
  .appending(path: "Zenbu Japanese", directoryHint: .isDirectory)
  .appending(path: "Translate Conversations", directoryHint: .isDirectory)

  static let retentionKey = "translate.history-retention.v1"

  public private(set) var conversations: [Conversation] = []
  public private(set) var isLoaded = false
  public var retention: HistoryRetention {
    didSet {
      defaults.set(retention.rawValue, forKey: Self.retentionKey)
      applyRetention()
    }
  }

  @ObservationIgnored private let store: ConversationFileStore
  @ObservationIgnored private let defaults: UserDefaults
  @ObservationIgnored private let now: () -> Date
  @ObservationIgnored private var removedBeforeLoad: Set<UUID> = []
  @ObservationIgnored private var lastWrite: Task<Void, Never>?

  public init(
    directory: URL = ConversationHistory.defaultDirectory,
    defaults: UserDefaults = .standard,
    now: @escaping () -> Date = Date.init
  ) {
    store = ConversationFileStore(directory: directory)
    self.defaults = defaults
    self.now = now
    retention =
      defaults.string(forKey: Self.retentionKey).flatMap(HistoryRetention.init(rawValue:))
      ?? .forever
    lastWrite = Task { [store] in
      let loaded = await store.loadAll()
      finishLoading(loaded)
    }
  }

  public var latest: Conversation? { conversations.first }

  public func conversation(_ id: UUID) -> Conversation? {
    conversations.first { $0.id == id }
  }

  public func search(_ query: String) -> [Conversation] {
    conversations.filter { $0.matches(query) }
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
    for conversation in conversations { delete(conversation.id) }
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
    applyRetention()
  }

  private func applyRetention() {
    guard let cutoff = retention.cutoff(before: now()) else { return }
    for conversation in conversations where conversation.updatedAt < cutoff {
      delete(conversation.id)
    }
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
