import Foundation

struct KnownWordChange: Codable, Hashable, Sendable {
  let storedID: String
  let headword: String
  let reading: String
  let status: WordKnowledgeStatus

  private enum CodingKeys: String, CodingKey {
    case storedID, headword, reading, status, known
  }

  init(storedID: String, headword: String, reading: String, status: WordKnowledgeStatus) {
    self.storedID = storedID
    self.headword = headword
    self.reading = reading
    self.status = status
  }

  init(_ record: WordKnowledgeRecord) {
    self.init(
      storedID: record.entryID, headword: record.headword, reading: record.reading,
      status: record.status)
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    storedID = try container.decode(String.self, forKey: .storedID)
    headword = try container.decode(String.self, forKey: .headword)
    reading = try container.decode(String.self, forKey: .reading)
    status =
      try container.decodeIfPresent(WordKnowledgeStatus.self, forKey: .status)
      ?? (try container.decode(Bool.self, forKey: .known) ? .known : .unknown)
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(storedID, forKey: .storedID)
    try container.encode(headword, forKey: .headword)
    try container.encode(reading, forKey: .reading)
    try container.encode(status, forKey: .status)
    try container.encode(status == .known, forKey: .known)
  }

  func with(_ status: WordKnowledgeStatus) -> KnownWordChange {
    KnownWordChange(storedID: storedID, headword: headword, reading: reading, status: status)
  }
}

extension SyncedKnownWord {
  var status: WordKnowledgeStatus {
    let stated = state.map(WordKnowledgeStatus.init(stored:))
    if let stated, WordKnowledgeStatus.chosen.contains(stated) { return stated }
    return known ? .known : .unknown
  }
}

extension AccountSync {
  nonisolated static let unknownOperation = "unknown_operation"

  static func keepsTheDevicesState(_ change: QueuedSyncChange, code: String) -> Bool {
    change.key.entity == SyncEntity.knownWord && change.operation == "set"
      && code == unknownOperation
  }

  func resendWithoutLearning(_ change: QueuedSyncChange) {
    guard !state.hasQueuedChange(to: change.key), case .string(let stored)? = change.fields?["state"]
    else { return }
    let status = WordKnowledgeStatus(stored: stored)
    guard status != .learning else {
      state.retryNextLaunch.removeAll { $0.key == change.key }
      return state.retryNextLaunch.append(change)
    }
    state.enqueue(
      QueuedSyncChange(
        id: UUID().uuidString.lowercased(), key: change.key,
        operation: status == .known ? "mark" : "clear", baseVersion: state.version(of: change.key),
        fields: status == .known ? change.fields?.filter { $0.key != "state" } : nil,
        undo: change.undo))
  }

  func isStillWanted(_ retry: QueuedSyncChange) -> Bool {
    guard retry.key.entity == SyncEntity.knownWord,
      case .string(let stored)? = retry.fields?["state"]
    else { return true }
    return wordKnowledge.records[retry.key.entityID]?.status == WordKnowledgeStatus(stored: stored)
  }

  func undo(_ undo: SyncUndo) {
    switch undo {
    case .setKnown(let word):
      wordKnowledge.applySynced(word)
    case .removeList(let listID):
      wordLists.applySyncedRemoval(ofList: listID)
    case .restoreList(let list):
      wordLists.applySynced(list)
    case .removeWord(let listID, let storedID):
      wordLists.applySyncedRemoval(of: storedID, from: listID)
    case .restoreWord(let membership):
      wordLists.applySynced(membership)
    case .removeVideo(let videoID):
      watchHistory.applySyncedRemoval(of: videoID)
    case .restoreVideo(let video):
      watchHistory.applySynced(video)
    case .removeBookmark(let id):
      translations.applySyncedRemoval(ofBookmark: id)
    case .restoreBookmark(let bookmark):
      translations.applySynced(bookmark)
    case .restoreProfile(let fields):
      userProfile.applySynced(fields)
    }
  }
}
