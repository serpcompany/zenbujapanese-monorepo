import Foundation
import Observation

@MainActor
@Observable
final class AccountSync: LocalFileStore {
  static let mutationsPerRequest = 50
  static let unknownEntity = "unknown_entity"
  static let requestBytes = 48 * 1024

  private(set) var state = AccountSyncState()
  private(set) var isLoaded = false
  private(set) var isUnavailable = false
  private(set) var isSyncing = false
  private(set) var lastFailure: AccountServiceError?

  var account: SignedInAccount? { state.account }
  var sessionEndedOnItsOwn: Bool { state.endedOnItsOwn }
  var lastSyncedAt: Date? { state.lastSyncedAt }
  var queuedChangeCount: Int { state.queue.count }

  @ObservationIgnored let tokens: AccountTokens
  @ObservationIgnored private let api: AccountAPI
  @ObservationIgnored private let wordKnowledge: WordKnowledge
  @ObservationIgnored private let wordLists: WordLists
  @ObservationIgnored private let watchHistory: WatchHistory
  @ObservationIgnored private let file: AccountSyncStateFile
  @ObservationIgnored private let now: @MainActor () -> Date
  @ObservationIgnored let writes = LocalFileWriteQueue()
  @ObservationIgnored var onLocalChange: (() -> Void)?
  @ObservationIgnored private var session = 0
  @ObservationIgnored private var caughtUpThisLaunch = false
  @ObservationIgnored private var changesBeforeLoad: [SavedItemChange] = []

  init(
    api: AccountAPI,
    tokens: AccountTokens,
    wordKnowledge: WordKnowledge,
    wordLists: WordLists,
    watchHistory: WatchHistory,
    fileURL: URL = AccountSync.defaultFileURL,
    now: @escaping @MainActor () -> Date = Date.init
  ) {
    self.api = api
    self.tokens = tokens
    self.wordKnowledge = wordKnowledge
    self.wordLists = wordLists
    self.watchHistory = watchHistory
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
      changesBeforeLoad.forEach(record)
      changesBeforeLoad = []
    }
    wordKnowledge.changeObserver = { [weak self] change in self?.record(change) }
    wordLists.changeObserver = { [weak self] change in self?.record(change) }
    watchHistory.changeObserver = { [weak self] change in self?.record(change) }
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

  func ready() async {
    await flush()
    await wordKnowledge.flush()
    await wordLists.flush()
  }

  func begin(_ signIn: AccountSignIn) async {
    await ready()
    tokens.replaceSession(with: signIn.sessionToken)
    session += 1
    lastFailure = nil
    let account = SignedInAccount(userID: signIn.userID, email: signIn.email)
    if !state.resume(as: account) {
      wordLists.useSharedFavoritesID()
      state = AccountSyncState(account: account)
      state.queue = uploads().map(\.upload)
    }
    persist()
  }

  func confirm(_ signIn: AccountSignIn) throws {
    guard signIn.userID == account?.userID else { throw AccountServiceError.differentAccount }
    tokens.replaceSession(with: signIn.sessionToken)
  }

  func endSession(onItsOwn: Bool = false) {
    session += 1
    tokens.forgetSession()
    state.signOut(onItsOwn: onItsOwn)
    lastFailure = nil
    persist()
  }

  func forgetAccount() {
    session += 1
    tokens.forgetSession()
    state = AccountSyncState()
    lastFailure = nil
    persist()
  }

  func sync() async throws {
    await ready()
    guard canSync, !isSyncing else { return }
    isSyncing = true
    defer { isSyncing = false }
    let session = session
    catchUpOnNewEntities()
    do {
      try await pull(in: session)
      lastFailure = nil
    } catch AccountServiceError.sessionEnded {
      if self.session == session { endSession(onItsOwn: true) }
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
    guard isLoaded else {
      changesBeforeLoad.append(change)
      return
    }
    guard !isUnavailable, state.keepsChanges else { return }
    state.enqueue(change.queued(in: state))
    persist()
    if account != nil { onLocalChange?() }
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
    let videos = watchHistory.videos.reversed().map {
      SavedItemChange.videoWatched($0, previous: nil)
    }
    return marks + lists + words + videos
  }

  private func catchUpOnNewEntities() {
    guard !caughtUpThisLaunch else { return }
    caughtUpThisLaunch = true
    let missing = Set(SyncEntity.uploaded).subtracting(state.syncedEntities)
    guard !missing.isEmpty else { return }
    state.queue += uploads().map(\.upload).filter { missing.contains($0.key.entity) }
    state.syncedEntities = SyncEntity.uploaded
    state.cursor = nil
    state.heldWords = []
    state.deferred = [:]
    persist()
  }

  private func nextBatch() -> [QueuedSyncChange] {
    var keys = Set<SyncEntityKey>()
    var batch: [QueuedSyncChange] = []
    var bytes = 0
    for change in state.queue {
      bytes += (try? JSONEncoder().encode(change.payload).count) ?? 0
      guard batch.isEmpty || bytes <= Self.requestBytes, batch.count < Self.mutationsPerRequest,
        keys.insert(change.key).inserted
      else { break }
      batch.append(change)
    }
    return batch
  }

  private func pull(in session: Int) async throws {
    var hasMore = true
    while hasMore || !state.queue.isEmpty {
      try Task.checkCancellation()
      let batch = nextBatch()
      let request = SyncRequestBody(cursor: state.cursor, mutations: batch.map(\.payload))
      let answer: SyncAnswer
      do {
        answer = try await tokens.withAccessToken { [api] token in
          try await api.sync(request, accessToken: token)
        }
      } catch AccountServiceError.refused(status: 410, _, _, _) where request.cursor != nil {
        guard self.session == session else { return }
        state.cursor = nil
        state.heldWords = []
        state.deferred = [:]
        persist()
        continue
      }
      guard self.session == session else { return }
      resolve(batch, with: answer.results)
      for change in answer.changes { apply(change) }
      await wordKnowledge.flush()
      await wordLists.flush()
      guard self.session == session else { return }
      state.cursor = answer.cursor
      persist()
      hasMore = answer.hasMore
    }
    let leftovers = state.deferred.values
    state.deferred = [:]
    leftovers.forEach(apply)
    placeHeldWords()
    state.accountHadFavorites = false
    state.lastSyncedAt = now()
    persist()
  }

  private func resolve(_ batch: [QueuedSyncChange], with results: [SyncResult]) {
    let sent = Set(batch.map(\.id))
    state.queue.removeAll { sent.contains($0.id) }
    let outcomes = Dictionary(results.map { ($0.id, $0.outcome) }) { first, _ in first }
    for change in batch {
      let settled = !state.hasQueuedChange(to: change.key)
      switch outcomes[change.id] {
      case .applied(let version):
        state.setVersion(version, of: change.key, gone: change.operation == "remove")
        state.rebase(change.key, from: change.baseVersion, to: version)
        if settled, let copy = state.deferred.removeValue(forKey: change.key.stored),
          copy.version == version
        {
          apply(copy)
        }
      case .conflict(let current):
        apply(current)
      case .rejected(let code):
        if code == Self.unknownEntity {
          state.syncedEntities.removeAll { $0 == change.key.entity }
        } else if change.undo == nil, change.key == AccountSyncState.favoritesKey,
          code == "already_exists"
        {
          state.accountHadFavorites = true
        } else if settled, let undo = change.undo {
          self.undo(undo)
        }
        if settled, let copy = state.deferred.removeValue(forKey: change.key.stored) {
          apply(copy)
        }
      case nil:
        continue
      }
    }
  }

  private func apply(_ change: SyncChange) {
    if let copy = AccountCopy(change) { apply(copy) }
  }

  private func apply(_ copy: AccountCopy) {
    guard !state.hasQueuedChange(to: copy.key) else {
      state.deferred[copy.key.stored] = copy
      return
    }
    state.deferred[copy.key.stored] = nil
    switch copy.value {
    case .knownWord(let word):
      wordKnowledge.applySynced(word)
    case .list(let list):
      if copy.key == AccountSyncState.favoritesKey { state.accountHadFavorites = false }
      wordLists.applySynced(list)
    case .listWord(let membership):
      guard wordLists.hasList(membership.listID) else { return state.hold(copy) }
      state.heldWords.removeAll { $0.key == copy.key }
      wordLists.applySynced(membership)
    case .watchedVideo(let video):
      watchHistory.applySynced(video)
    case .gone:
      removeLocally(copy.key)
    }
    state.setVersion(copy.version, of: copy.key, gone: copy.value == .gone)
  }

  private func placeHeldWords() {
    let held = state.heldWords
    state.heldWords = []
    for word in held {
      guard case .listWord(let membership) = word.value, wordLists.hasList(membership.listID)
      else { continue }
      apply(word)
    }
  }

  private func removeLocally(_ key: SyncEntityKey) {
    switch key.entity {
    case SyncEntity.knownWord:
      let record = wordKnowledge.records[key.entityID]
      wordKnowledge.applySynced(
        KnownWordChange(
          storedID: key.entityID, headword: record?.headword ?? "", reading: record?.reading ?? "",
          known: false))
    case SyncEntity.list:
      guard let listID = UUID(uuidString: key.entityID) else { return }
      if key == AccountSyncState.favoritesKey, state.accountHadFavorites {
        state.accountHadFavorites = false
        keepAsNewList(listID)
      } else {
        wordLists.applySyncedRemoval(ofList: listID)
      }
      state.forgetWords(of: listID)
    case SyncEntity.listWord:
      guard let parts = key.listWordParts else { return }
      state.heldWords.removeAll { $0.key == key }
      wordLists.applySyncedRemoval(of: parts.storedID, from: parts.listID)
    case SyncEntity.watchedVideo:
      watchHistory.applySyncedRemoval(of: key.entityID)
    default:
      return
    }
  }

  private func keepAsNewList(_ listID: UUID) {
    guard let moved = wordLists.moveList(listID, to: UUID()) else { return }
    state.queue.append(SavedItemChange.listCreated(moved.list).upload)
    state.queue += moved.words.reversed().map { SavedItemChange.wordAdded($0).upload }
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
    case .removeVideo(let videoID):
      watchHistory.applySyncedRemoval(of: videoID)
    case .restoreVideo(let video):
      watchHistory.applySynced(video)
    }
  }

  nonisolated static let defaultFileURL = FileManager.default.urls(
    for: .applicationSupportDirectory,
    in: .userDomainMask
  )[0]
  .appending(path: "Zenbu Japanese", directoryHint: .isDirectory)
  .appending(path: "account-sync.json")
}
