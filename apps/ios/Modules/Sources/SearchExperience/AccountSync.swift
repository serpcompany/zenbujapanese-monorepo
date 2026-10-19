import Foundation
import Observation
import TranslatorCore

@MainActor
@Observable
final class AccountSync: LocalFileStore {
  static let mutationsPerRequest = 50
  static let unknownEntity = "unknown_entity"
  static let requestBytes = 48 * 1024

  var state = AccountSyncState()
  private(set) var isLoaded = false
  private(set) var isUnavailable = false
  private(set) var isSyncing = false
  private(set) var lastFailure: AccountServiceError?
  var keptRevision = 0
  var downloadsLeft = 0
  var photosUnavailable = false

  var account: SignedInAccount? { state.account }
  var sessionEndedOnItsOwn: Bool { state.endedOnItsOwn }
  var lastSyncedAt: Date? { state.lastSyncedAt }
  var queuedChangeCount: Int { state.queue.filter { !state.holds($0.key) }.count }

  @ObservationIgnored let tokens: AccountTokens
  @ObservationIgnored let api: AccountAPI
  @ObservationIgnored let kept: KeptStores
  @ObservationIgnored var keptToApply: [AccountCopy] = []
  @ObservationIgnored var filesWait = false
  @ObservationIgnored var downloadsWait: TimeInterval?
  @ObservationIgnored let wordKnowledge: WordKnowledge
  @ObservationIgnored let wordLists: WordLists
  @ObservationIgnored let watchHistory: WatchHistory
  @ObservationIgnored let translations: ConversationHistory
  @ObservationIgnored let userProfile: UserProfile
  @ObservationIgnored private let file: AccountSyncStateFile
  @ObservationIgnored private let now: @MainActor () -> Date
  @ObservationIgnored let writes = LocalFileWriteQueue()
  @ObservationIgnored var onLocalChange: (() -> Void)?
  @ObservationIgnored var onRetryFiles: ((TimeInterval) -> Void)?
  @ObservationIgnored private(set) var session = 0
  @ObservationIgnored var caughtUpThisLaunch = false
  @ObservationIgnored private var changesBeforeLoad: [SavedItemChange] = []

  init(
    api: AccountAPI,
    tokens: AccountTokens,
    wordKnowledge: WordKnowledge,
    wordLists: WordLists,
    watchHistory: WatchHistory,
    translations: ConversationHistory,
    profile: UserProfile,
    kept: KeptStores,
    fileURL: URL = AccountSync.defaultFileURL,
    now: @escaping @MainActor () -> Date = Date.init
  ) {
    self.api = api
    self.tokens = tokens
    self.wordKnowledge = wordKnowledge
    self.wordLists = wordLists
    self.watchHistory = watchHistory
    self.translations = translations
    userProfile = profile
    self.kept = kept
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
    profile.changeObserver = { [weak self] change in self?.record(change) }
    observeKeptChanges()
    translations.bookmarkObserver = { [weak self] change in
      switch change {
      case .added(let bookmark): self?.record(.bookmarkAdded(bookmark))
      case .removed(let bookmark): self?.record(.bookmarkRemoved(bookmark))
      }
    }
  }

  var canSync: Bool {
    isLoaded && !isUnavailable && account != nil && wordKnowledge.canChange
      && wordLists.canChange && translations.isLoaded && !waitsForUnreadableBookmarks
  }

  var bookmarksProblem: SharedBookmarksProblem? { translations.bookmarksProblem }
  var waitsForUnreadableBookmarks: Bool { bookmarksProblem != nil }

  func isDue(staleAfter: TimeInterval) -> Bool {
    guard canSync else { return false }
    guard state.queue.isEmpty, let lastSyncedAt else { return true }
    return now().timeIntervalSince(lastSyncedAt) > staleAfter
  }

  func ready() async {
    kept.settings.noticeChanges()
    await flush()
    await wordKnowledge.flush()
    await wordLists.flush()
    await translations.flush()
  }

  func begin(_ signIn: AccountSignIn) async {
    await ready()
    tokens.replaceSession(with: signIn.sessionToken)
    session += 1
    lastFailure = nil
    let account = SignedInAccount(userID: signIn.userID, email: signIn.email)
    if !state.resume(as: account) {
      let switchesAccount = state.account != nil || state.signedOutFrom != nil
      wordLists.useSharedFavoritesID()
      state = AccountSyncState(account: account)
      state.takesAccountProfile = switchesAccount
      state.syncedEntities = []
      caughtUpThisLaunch = false
    }
    state.versions[state.profileKey.stored] = nil
    persist()
  }

  func confirm(_ signIn: AccountSignIn) throws {
    guard signIn.userID == account?.userID else { throw AccountServiceError.differentAccount }
    tokens.confirmSession(with: signIn.sessionToken)
  }

  func endSession(onItsOwn: Bool = false) {
    session += 1
    tokens.forgetSession()
    state.signOut(onItsOwn: onItsOwn)
    userProfile.refusal = nil
    lastFailure = nil
    persist()
  }

  func forgetAccount() {
    session += 1
    tokens.forgetSession()
    state = AccountSyncState()
    userProfile.refusal = nil
    lastFailure = nil
    persist()
  }

  func sync() async throws {
    await ready()
    guard canSync, !isSyncing else { return }
    isSyncing = true
    defer { isSyncing = false }
    let session = session
    filesWait = false
    downloadsWait = nil
    await catchUpOnNewEntities()
    do {
      try await readProfileIfNew(in: session)
      try await pull(in: session)
      lastFailure = nil
    } catch AccountServiceError.sessionEnded {
      guard self.session == session else { return }
      endSession(onItsOwn: true)
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

  func recordKept(_ change: KeptLocalChange) {
    record(.kept(change))
  }

  private func record(_ change: SavedItemChange) {
    guard isLoaded else {
      changesBeforeLoad.append(change)
      return
    }
    guard !isUnavailable, state.keepsChanges, let change = identifyingSearch(change) else { return }
    state.forgetRefusal(of: change)
    state.enqueue(change.queued(in: state))
    persist()
    if account != nil, !change.ridesAlong { onLocalChange?() }
  }

  private func readProfileIfNew(in session: Int) async throws {
    guard !state.knowsProfile else { return }
    let current: SyncedProfile
    do {
      current = try await tokens.withAccessToken { [api] token in
        try await api.profile(accessToken: token)
      }
    } catch AccountServiceError.refused(let status, _, _, _) where status != 401 {
      return
    } catch AccountServiceError.unreadableAnswer {
      return
    }
    guard self.session == session, current.id == account?.userID else { return }
    userProfile.applySynced(state.takeFirst(current, over: userProfile.fields))
    persist()
  }

  private func pull(in session: Int) async throws {
    var hasMore = true
    while hasMore || state.queue.contains(where: isSendable) {
      try Task.checkCancellation()
      let batch = try await uploadFiles(for: nextBatch())
      guard self.session == session else { return }
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
      await takeSearchKey(answer.searchKey)
      guard self.session == session else { return }
      for change in answer.changes { apply(change) }
      await drainKept(in: session)
      await wordKnowledge.flush()
      await wordLists.flush()
      await translations.flush()
      guard self.session == session else { return }
      state.cursor = answer.cursor
      persist()
      hasMore = answer.hasMore
    }
    let leftovers = state.deferred.values
    state.deferred = [:]
    leftovers.forEach(apply)
    await drainKept(in: session)
    await retryWaitingFiles(in: session)
    guard self.session == session else { return }
    if let wait = downloadsWait { onRetryFiles?(wait) }
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
      if let photoID = Self.fileUploaded(by: change) { state.uploadedFiles.removeAll { $0 == photoID } }
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
        if !keptConflict(change, current: current) { apply(current) }
      case .rejected(let code):
        keptRejected(change, code: code)
        if code == Self.unknownEntity {
          state.syncedEntities.removeAll { $0 == change.key.entity }
          state.queue.removeAll { $0.key.entity == change.key.entity }
        } else if change.undo == nil, change.key == AccountSyncState.favoritesKey,
          code == "already_exists"
        {
          state.accountHadFavorites = true
        } else if case .restoreProfile(let fields) = change.undo {
          let restored = state.handOn(fields, from: change.key)
          if !restored.isEmpty {
            userProfile.applySynced(restored)
            userProfile.refusal = ProfileRefusal(code: code)
          }
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

  func apply(_ copy: AccountCopy) {
    guard copy.key.entity != SyncEntity.wordNote || !state.refusedNotes.contains(copy.key.entityID)
    else { return }
    guard !state.hasQueuedChange(to: copy.key), !state.holds(copy.key) else {
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
    case .bookmark(let bookmark):
      translations.applySynced(bookmark)
    case .profile(let fields):
      userProfile.applySynced(fields.keepingWhatCantGoUp(on: userProfile.fields))
    case .kept:
      keptToApply.append(copy)
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
    case SyncEntity.bookmarkedSentence:
      guard let id = UUID(uuidString: key.entityID) else { return }
      translations.applySyncedRemoval(ofBookmark: id)
    default:
      keptToApply.append(AccountCopy(key: key, version: 0, value: .gone))
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
    case .removeBookmark(let id):
      translations.applySyncedRemoval(ofBookmark: id)
    case .restoreBookmark(let bookmark):
      translations.applySynced(bookmark)
    case .restoreProfile(let fields):
      userProfile.applySynced(fields)
    }
  }

  nonisolated static let defaultFileURL = FileManager.default.urls(
    for: .applicationSupportDirectory,
    in: .userDomainMask
  )[0]
  .appending(path: "Zenbu Japanese", directoryHint: .isDirectory)
  .appending(path: "account-sync.json")
}
