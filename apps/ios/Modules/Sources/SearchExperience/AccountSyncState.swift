import Foundation

enum SavedItemChange: Sendable {
  case known(KnownWordChange)
  case listCreated(WordList)
  case listChanged(WordList, previous: WordList)
  case listDeleted(UUID)
  case wordAdded(WordListMembership)
  case wordRemoved(WordListMembership)
}

struct KnownWordChange: Codable, Hashable, Sendable {
  let storedID: String
  let headword: String
  let reading: String
  let known: Bool
}

enum SyncUndo: Codable, Hashable, Sendable {
  case setKnown(KnownWordChange)
  case removeList(UUID)
  case restoreList(WordList)
  case removeWord(listID: UUID, storedID: String)
  case restoreWord(WordListMembership)
}

struct QueuedSyncChange: Codable, Hashable, Sendable, Identifiable {
  let id: String
  let key: SyncEntityKey
  let operation: String
  var baseVersion: Int
  let fields: [String: SyncFieldValue]?
  let undo: SyncUndo?

  func merging(_ later: QueuedSyncChange) -> QueuedSyncChange {
    QueuedSyncChange(
      id: id, key: key, operation: operation, baseVersion: baseVersion,
      fields: (fields ?? [:]).merging(later.fields ?? [:]) { _, newer in newer }, undo: undo)
  }

  var payload: SyncMutationPayload {
    SyncMutationPayload(
      id: id, entity: key.entity, operation: operation, entityId: key.entityID,
      baseVersion: baseVersion, fields: fields)
  }
}

struct SignedInAccount: Codable, Hashable, Sendable {
  let userID: String
  let email: String
}

struct AccountCopy: Codable, Hashable, Sendable {
  enum Value: Codable, Hashable, Sendable {
    case knownWord(KnownWordChange)
    case list(WordList)
    case listWord(WordListMembership)
    case gone
  }

  let key: SyncEntityKey
  let version: Int
  let value: Value

  init?(_ change: SyncChange) {
    key = change.key
    version = change.version
    switch change.payload {
    case .knownWord(let word):
      value = .knownWord(
        KnownWordChange(
          storedID: word.itemId, headword: word.headword, reading: word.reading, known: word.known))
    case .list(let list):
      guard let id = UUID(uuidString: list.id) else { return nil }
      value = .list(
        WordList(
          id: id, name: list.name, position: list.position, createdAt: list.createdAt,
          updatedAt: list.createdAt))
    case .listWord(let word):
      guard let listID = UUID(uuidString: word.listId) else { return nil }
      value = .listWord(
        WordListMembership(
          listID: listID, entryID: word.itemId, headword: word.headword, reading: word.reading,
          addedAt: word.addedAt))
    case .gone:
      value = .gone
    case .unsynced:
      return nil
    }
  }
}

struct AccountSyncState: Codable, Sendable, Equatable {
  static let favoritesKey = SyncEntityKey(
    entity: SyncEntity.list, entityID: SyncEntityKey.listID(WordLists.favoritesID))

  var account: SignedInAccount?
  var signedOutFrom: SignedInAccount?
  var cursor: String?
  var lastSyncedAt: Date?
  var queue: [QueuedSyncChange] = []
  var versions: [String: Int] = [:]
  var heldWords: [AccountCopy] = []
  var deferred: [String: AccountCopy] = [:]
  var accountHadFavorites = false
  var signedOutQueueStart: Int?
  var endedOnItsOwn = false

  init(account: SignedInAccount? = nil) {
    self.account = account
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    account = try container.decodeIfPresent(SignedInAccount.self, forKey: .account)
    signedOutFrom = try container.decodeIfPresent(SignedInAccount.self, forKey: .signedOutFrom)
    cursor = try container.decodeIfPresent(String.self, forKey: .cursor)
    lastSyncedAt = try container.decodeIfPresent(Date.self, forKey: .lastSyncedAt)
    queue = try container.decodeIfPresent([QueuedSyncChange].self, forKey: .queue) ?? []
    versions = try container.decodeIfPresent([String: Int].self, forKey: .versions) ?? [:]
    heldWords = try container.decodeIfPresent([AccountCopy].self, forKey: .heldWords) ?? []
    deferred = try container.decodeIfPresent([String: AccountCopy].self, forKey: .deferred) ?? [:]
    accountHadFavorites =
      try container.decodeIfPresent(Bool.self, forKey: .accountHadFavorites) ?? false
    signedOutQueueStart = try container.decodeIfPresent(Int.self, forKey: .signedOutQueueStart)
    endedOnItsOwn = try container.decodeIfPresent(Bool.self, forKey: .endedOnItsOwn) ?? false
  }

  var keepsChanges: Bool { account != nil || signedOutFrom != nil }

  mutating func signOut(onItsOwn: Bool) {
    signedOutFrom = account ?? signedOutFrom
    account = nil
    endedOnItsOwn = onItsOwn
    if signedOutQueueStart == nil { signedOutQueueStart = queue.count }
  }

  mutating func resume(as account: SignedInAccount) -> Bool {
    guard signedOutFrom?.userID == account.userID else { return false }
    self.account = account
    signedOutFrom = nil
    signedOutQueueStart = nil
    endedOnItsOwn = false
    return true
  }

  mutating func enqueue(_ change: QueuedSyncChange) {
    guard let start = signedOutQueueStart,
      let earlier = queue[start...].lastIndex(where: { $0.key == change.key })
    else { return queue.append(change) }
    let previous = queue[earlier]
    switch (change.key.entity, previous.operation, change.operation) {
    case (SyncEntity.list, "create", "update"), (SyncEntity.list, "update", "update"):
      queue[earlier] = previous.merging(change)
      return
    case (SyncEntity.list, "update", "delete"), (SyncEntity.knownWord, _, _),
      (SyncEntity.listWord, _, _):
      queue.remove(at: earlier)
    default:
      break
    }
    queue.append(change)
  }

  func version(of key: SyncEntityKey) -> Int {
    queue.last { $0.key == key }?.baseVersion ?? versions[key.stored] ?? 0
  }

  func hasQueuedChange(to key: SyncEntityKey) -> Bool {
    queue.contains { $0.key == key }
  }

  mutating func rebase(_ key: SyncEntityKey, from base: Int, to version: Int) {
    for index in queue.indices where queue[index].key == key && queue[index].baseVersion == base {
      queue[index].baseVersion = version
    }
  }

  mutating func forgetWords(of listID: UUID) {
    let prefix = SyncEntityKey.listWord(listID: listID, storedID: "").stored
    versions = versions.filter { !$0.key.hasPrefix(prefix) }
    deferred = deferred.filter { !$0.key.hasPrefix(prefix) }
    heldWords.removeAll { $0.key.listWordParts?.listID == listID }
  }

  mutating func hold(_ word: AccountCopy) {
    heldWords.removeAll { $0.key == word.key }
    heldWords.append(word)
  }
}

enum AccountSyncStateLoad: Sendable {
  case fresh
  case loaded(AccountSyncState)
  case unavailable
}

actor AccountSyncStateFile {
  private struct StoredFile: Codable {
    static let currentVersion = 1
    var version = currentVersion
    var state: AccountSyncState
  }

  private let file: LocalJSONFile

  init(fileURL: URL) {
    file = LocalJSONFile(
      fileURL: fileURL, currentVersion: StoredFile.currentVersion,
      description: "account sync", logCategory: "AccountSync")
  }

  func load() async -> AccountSyncStateLoad {
    switch await file.read() {
    case .missing:
      return .fresh
    case .unreadable, .newerVersion:
      return .unavailable
    case .current(let data):
      if let stored = try? JSONDecoder.localStore.decode(StoredFile.self, from: data) {
        return .loaded(stored.state)
      }
      return await file.keepUnreadableCopy() ? .fresh : .unavailable
    }
  }

  func write(_ state: AccountSyncState) async -> Bool {
    guard let data = try? JSONEncoder.localStore.encode(StoredFile(state: state)) else {
      return false
    }
    return await file.write(data)
  }
}

extension SavedItemChange {
  func queued(in state: AccountSyncState) -> QueuedSyncChange {
    switch self {
    case .known(let change):
      let key = SyncEntityKey(entity: SyncEntity.knownWord, entityID: change.storedID)
      let fields = change.known ? Self.text(change.headword, change.reading) : nil
      let previous = KnownWordChange(
        storedID: change.storedID, headword: change.headword, reading: change.reading,
        known: !change.known)
      return Self.queued(
        key, change.known ? "mark" : "clear", state, fields: fields, undo: .setKnown(previous))
    case .listCreated(let list):
      return Self.queued(
        Self.key(list.id), "create", state,
        fields: ["name": .string(list.name), "position": .number(list.position)],
        undo: .removeList(list.id))
    case .listChanged(let list, let previous):
      var fields: [String: SyncFieldValue] = [:]
      if list.name != previous.name { fields["name"] = .string(list.name) }
      if list.position != previous.position { fields["position"] = .number(list.position) }
      return Self.queued(
        Self.key(list.id), "update", state, fields: fields, undo: .restoreList(previous))
    case .listDeleted(let id):
      return Self.queued(Self.key(id), "delete", state, fields: nil, undo: nil)
    case .wordAdded(let word):
      return Self.queued(
        .listWord(listID: word.listID, storedID: word.entryID), "add", state,
        fields: Self.text(word.headword, word.reading),
        undo: .removeWord(listID: word.listID, storedID: word.entryID))
    case .wordRemoved(let word):
      return Self.queued(
        .listWord(listID: word.listID, storedID: word.entryID), "remove", state, fields: nil,
        undo: .restoreWord(word))
    }
  }

  var upload: QueuedSyncChange {
    let queued = queued(in: AccountSyncState())
    return QueuedSyncChange(
      id: queued.id, key: queued.key, operation: queued.operation, baseVersion: 0,
      fields: queued.fields, undo: nil)
  }

  private static func key(_ listID: UUID) -> SyncEntityKey {
    SyncEntityKey(entity: SyncEntity.list, entityID: SyncEntityKey.listID(listID))
  }

  private static func text(_ headword: String, _ reading: String) -> [String: SyncFieldValue] {
    ["headword": .string(headword), "reading": .string(reading)]
  }

  private static func queued(
    _ key: SyncEntityKey, _ operation: String, _ state: AccountSyncState,
    fields: [String: SyncFieldValue]?, undo: SyncUndo?
  ) -> QueuedSyncChange {
    QueuedSyncChange(
      id: UUID().uuidString.lowercased(), key: key, operation: operation,
      baseVersion: state.version(of: key), fields: fields, undo: undo)
  }
}
