import Foundation
import Synchronization
import notify

enum SharedContainer {
  static let groupPrefix = "group.com.zenbujapanese.dictionary"
  static let wordLists = "word-lists.json"
  static let wordKnowledge = "word-knowledge.json"

  static var identifier: String {
    groupPrefix + ((Bundle.main.object(forInfoDictionaryKey: "ZenbuBundleIDSuffix") as? String) ?? "")
  }

  static let folder: URL? = AppGroupContainer.url(identifier)?
    .appending(path: "Library/Application Support/Zenbu Japanese", directoryHint: .isDirectory)

  static func copy(named name: String) -> URL? {
    folder?.appending(path: name)
  }
}

enum SharedChange: Codable, Equatable, Sendable {
  case listCreated(WordList)
  case wordAdded(WordListMembership)
  case wordRemoved(WordListMembership)
  case known(KnownWordChange)

  init?(_ change: SavedItemChange) {
    switch change {
    case .listCreated(let list): self = .listCreated(list)
    case .wordAdded(let membership): self = .wordAdded(membership)
    case .wordRemoved(let membership): self = .wordRemoved(membership)
    case .known(let word, _): self = .known(word)
    default: return nil
    }
  }

  @MainActor
  func canApply(to lists: WordLists, _ knowledge: WordKnowledge) -> Bool {
    switch self {
    case .listCreated, .wordAdded, .wordRemoved: lists.canChange
    case .known: knowledge.canChange
    }
  }

  @MainActor
  func apply(to lists: WordLists, _ knowledge: WordKnowledge, madeAt time: Date? = nil) {
    switch self {
    case .listCreated(let list):
      lists.createList(named: list.name, id: list.id)
    case .wordAdded(let word):
      lists.addWord(
        LanguageReferenceID(rawValue: word.entryID), headword: word.headword,
        reading: word.reading, to: word.listID)
    case .wordRemoved(let word):
      lists.remove(storedID: word.entryID, from: word.listID)
    case .known(let word):
      knowledge.setStatus(
        word.status, id: LanguageReferenceID(rawValue: word.storedID),
        headword: word.headword, reading: word.reading, at: time ?? word.changedAt)
    }
  }
}

struct SharedChanges: Sendable {
  let folder: URL
  private static let recorded = Mutex(0)
  @MainActor private static var applying = Set<URL>()

  static let inbox = SharedContainer.folder.map {
    SharedChanges(folder: $0.appending(path: "Shared Changes", directoryHint: .isDirectory))
  }

  static var notice: String { "\(SharedContainer.identifier).shared-changes" }

  func record(_ change: SavedItemChange) {
    guard let shared = SharedChange(change),
      let data = try? JSONEncoder.localStore.encode(shared)
    else { return }
    try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    let count = Self.recorded.withLock { count in
      count += 1
      return count
    }
    let name = String(
      format: "%020llu-%010d-%@.json", clock_gettime_nsec_np(CLOCK_REALTIME), count,
      UUID().uuidString)
    try? data.write(to: folder.appending(path: name), options: .atomic)
    notify_post(Self.notice)
  }

  static func madeAt(_ name: String) -> Date? {
    let digits = name.prefix { $0.isASCII && $0.isNumber }
    guard digits.count == nanosecondDigits, let nanoseconds = UInt64(digits) else { return nil }
    return Date(timeIntervalSince1970: Double(nanoseconds) / 1_000_000_000)
  }

  private static let nanosecondDigits = 20

  func pending() -> [(file: URL, change: SharedChange)] {
    let names = (try? FileManager.default.contentsOfDirectory(atPath: folder.path)) ?? []
    return names.filter { $0.hasSuffix(".json") }.sorted().compactMap { name in
      let file = folder.appending(path: name)
      guard let data = try? Data(contentsOf: file),
        let change = try? JSONDecoder.localStore.decode(SharedChange.self, from: data)
      else {
        try? FileManager.default.removeItem(at: file)
        return nil
      }
      return (file, change)
    }
  }

  @MainActor
  func apply(to lists: WordLists, _ knowledge: WordKnowledge) async {
    await lists.flush()
    await knowledge.flush()
    var applied: [URL] = []
    for (file, change) in pending()
    where !Self.applying.contains(file) && change.canApply(to: lists, knowledge) {
      Self.applying.insert(file)
      change.apply(to: lists, knowledge, madeAt: Self.madeAt(file.lastPathComponent))
      applied.append(file)
    }
    guard !applied.isEmpty else { return }
    await lists.flush()
    await knowledge.flush()
    if !lists.writes.hasUnsavedChanges, !knowledge.writes.hasUnsavedChanges {
      for file in applied { try? FileManager.default.removeItem(at: file) }
    }
    Self.applying.subtract(applied)
  }
}
