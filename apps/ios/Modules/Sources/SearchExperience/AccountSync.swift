import Foundation
import Observation

@MainActor
@Observable
final class AccountSync: LocalFileStore {
  static let mutationsPerRequest = 50

  private(set) var state = AccountSyncState()
  private(set) var isLoaded = false
  private(set) var isUnavailable = false
  private(set) var isSyncing = false
  private(set) var lastFailure: AccountServiceError?
  private(set) var sessionEndedOnItsOwn = false

  var account: SignedInAccount? { state.account }
  var lastSyncedAt: Date? { state.lastSyncedAt }
  var queuedChangeCount: Int { state.queue.count }

  @ObservationIgnored let tokens: AccountTokens
  @ObservationIgnored private let api: AccountAPI
  @ObservationIgnored private let wordKnowledge: WordKnowledge
  @ObservationIgnored private let wordLists: WordLists
  @ObservationIgnored private let file: AccountSyncStateFile
  @ObservationIgnored private let now: @MainActor () -> Date
  @ObservationIgnored let writes = LocalFileWriteQueue()
  @ObservationIgnored var onLocalChange: (() -> Void)?

  init(
    api: AccountAPI,
    tokens: AccountTokens,
    wordKnowledge: WordKnowledge,
    wordLists: WordLists,
    fileURL: URL = AccountSync.defaultFileURL,
    now: @escaping @MainActor () -> Date = Date.init
  ) {
    self.api = api
    self.tokens = tokens
    self.wordKnowledge = wordKnowledge
    self.wordLists = wordLists
    self.now = now
    let file = AccountSyncStateFile(fileURL: fileURL)
    self.file = file
    writes.load { [self] in
      switch await file.load() {
      case .fresh:
        break
      case .loaded(let loaded):
        state = loaded
      case .unavailable:
        isUnavailable = true
      }
      isLoaded = true
      guard !isUnavailable else { return }
      if state.account == nil {
        tokens.forgetSession()
      } else if tokens.sessionToken == nil {
        endSession()
      }
    }
    wordKnowledge.changeObserver = { [weak self] change in self?.record(change) }
    wordLists.changeObserver = { [weak self] change in self?.record(change) }
  }

  var canSync: Bool {
    isLoaded && !isUnavailable && account != nil && wordKnowledge.canChange
      && wordLists.canChange
  }

  func isDue(staleAfter: TimeInterval) -> Bool {
    guard canSync else { return false }
    guard state.queue.isEmpty, let lastSyncedAt else { return true }
    return now().timeIntervalSince(lastSyncedAt) > staleAfter
  }

  func begin(_ signIn: AccountSignIn) async {
    await flush()
    await wordKnowledge.flush()
    await wordLists.flush()
    tokens.replaceSession(with: signIn.sessionToken)
    sessionEndedOnItsOwn = false
    lastFailure = nil
    state = AccountSyncState(account: SignedInAccount(userID: signIn.userID, email: signIn.email))
    state.queue = uploads().map(\.upload)
    persist()
  }

  func resume(_ signIn: AccountSignIn) throws {
    guard signIn.userID == account?.userID else { throw AccountServiceError.differentAccount }
    tokens.replaceSession(with: signIn.sessionToken)
  }

  func endSession(onItsOwn: Bool = false) {
    tokens.forgetSession()
    state = AccountSyncState()
    sessionEndedOnItsOwn = onItsOwn
    lastFailure = nil
    persist()
  }

  func sync() async throws {
    await flush()
    await wordKnowledge.flush()
    await wordLists.flush()
    guard canSync, !isSyncing, let account else { return }
    isSyncing = true
    defer { isSyncing = false }
    do {
      try await pull(for: account)
      lastFailure = nil
    } catch AccountServiceError.sessionEnded {
      if self.account == account { endSession(onItsOwn: true) }
      throw AccountServiceError.sessionEnded
    } catch let failure as AccountServiceError {
      lastFailure = failure
      throw failure
    }
  }

  func persist() {
    guard isLoaded, !isUnavailable else { return }
    let file = file
    writes.save { [self] in await file.write(state) }
  }

  private func record(_ change: SavedItemChange) {
    guard canSync else { return }
    state.queue.append(change.queued(in: state))
    persist()
    onLocalChange?()
  }

  private func uploads() -> [SavedItemChange] {
    let marks = wordKnowledge.knownRecords.reversed().map {
      SavedItemChange.known(
        KnownWordChange(
          storedID: $0.entryID, headword: $0.headword, reading: $0.reading, known: true))
    }
    let lists = wordLists.lists.map(SavedItemChange.listCreated)
    let words = wordLists.lists.flatMap { wordLists.words(in: $0.id).reversed() }
      .map(SavedItemChange.wordAdded)
    return marks + lists + words
  }

  private func nextBatch() -> [QueuedSyncChange] {
    var keys = Set<SyncEntityKey>()
    var batch: [QueuedSyncChange] = []
    for change in state.queue {
      guard batch.count < Self.mutationsPerRequest, keys.insert(change.key).inserted else { break }
      batch.append(change)
    }
    return batch
  }

  private func pull(for account: SignedInAccount) async throws {
    var heldWords: [SyncChange] = []
    var hasMore = true
    while hasMore || !state.queue.isEmpty {
      let batch = nextBatch()
      let request = SyncRequestBody(cursor: state.cursor, mutations: batch.map(\.payload))
      let answer: SyncAnswer
      do {
        answer = try await tokens.withAccessToken { [api] token in
          try await api.sync(request, accessToken: token)
        }
      } catch AccountServiceError.refused(status: 410, _, _, _) where request.cursor != nil {
        guard self.account == account else { return }
        state.cursor = nil
        heldWords.removeAll()
        persist()
        continue
      }
      guard self.account == account else { return }
      resolve(batch, with: answer.results, holding: &heldWords)
      for change in answer.changes { apply(change, holding: &heldWords) }
      await wordKnowledge.flush()
      await wordLists.flush()
      state.cursor = answer.cursor
      persist()
      hasMore = answer.hasMore
    }
    var unplaced: [SyncChange] = []
    for change in heldWords { apply(change, holding: &unplaced) }
    state.lastSyncedAt = now()
    persist()
  }

  private func resolve(
    _ batch: [QueuedSyncChange], with results: [SyncResult], holding heldWords: inout [SyncChange]
  ) {
    let sent = Set(batch.map(\.id))
    state.queue.removeAll { sent.contains($0.id) }
    let outcomes = Dictionary(results.map { ($0.id, $0.outcome) }) { first, _ in first }
    for change in batch {
      switch outcomes[change.id] {
      case .applied(let version):
        state.versions[change.key.stored] = version
        state.rebase(change.key, from: change.baseVersion, to: version)
      case .conflict(let current):
        apply(current, holding: &heldWords)
      case .rejected:
        if !state.hasQueuedChange(to: change.key), let undo = change.undo { self.undo(undo) }
      case nil:
        continue
      }
    }
  }

  private func apply(_ change: SyncChange, holding heldWords: inout [SyncChange]) {
    guard !state.hasQueuedChange(to: change.key) else { return }
    switch change.payload {
    case .knownWord(let word):
      wordKnowledge.applySynced(
        KnownWordChange(
          storedID: word.itemId, headword: word.headword, reading: word.reading, known: word.known))
    case .list(let list):
      guard let id = UUID(uuidString: list.id) else { return }
      wordLists.applySynced(
        WordList(
          id: id, name: list.name, position: list.position, createdAt: list.createdAt,
          updatedAt: list.createdAt))
    case .listWord(let word):
      guard let listID = UUID(uuidString: word.listId) else { return }
      guard wordLists.hasList(listID) else {
        heldWords.append(change)
        return
      }
      wordLists.applySynced(
        WordListMembership(
          listID: listID, entryID: word.itemId, headword: word.headword, reading: word.reading,
          addedAt: word.addedAt))
    case .gone:
      removeLocally(change.key, holding: &heldWords)
    case .unsynced:
      return
    }
    state.versions[change.key.stored] = change.version
  }

  private func removeLocally(_ key: SyncEntityKey, holding heldWords: inout [SyncChange]) {
    switch key.entity {
    case SyncEntity.knownWord:
      wordKnowledge.applySynced(
        KnownWordChange(storedID: key.entityID, headword: "", reading: "", known: false))
    case SyncEntity.list:
      guard let listID = UUID(uuidString: key.entityID) else { return }
      wordLists.applySyncedRemoval(ofList: listID)
      state.forgetWords(of: listID)
      heldWords.removeAll { $0.key.listWordParts?.listID == listID }
    case SyncEntity.listWord:
      guard let parts = key.listWordParts else { return }
      wordLists.applySyncedRemoval(of: parts.storedID, from: parts.listID)
    default:
      return
    }
  }

  private func undo(_ undo: SyncUndo) {
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
    }
  }

  nonisolated static let defaultFileURL = FileManager.default.urls(
    for: .applicationSupportDirectory,
    in: .userDomainMask
  )[0]
  .appending(path: "Zenbu Japanese", directoryHint: .isDirectory)
  .appending(path: "account-sync.json")
}
