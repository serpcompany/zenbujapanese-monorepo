import Foundation

@MainActor
struct KeptStores {
  let notes: WordNoteStorage
  let media: EncounterMediaStorage
  let searches: RecentSearchHistory
  let settings: SyncedSettings
  var frequency = FrequencyChoice()
  var notesChanged: @MainActor @Sendable () async -> Void = {}

  static var shared: KeptStores {
    KeptStores(
      notes: .shared, media: .shared, searches: .shared, settings: .shared, frequency: .live,
      notesChanged: { await LearnerNotes.shared.reload() })
  }
}

struct FrequencyChoice: Sendable {
  static let setting = "frequencyDictionaries.chosen"

  var relay = KeptChangeRelay()
  var changedFromStandard: @Sendable () async -> KeptLocalChange? = { nil }
  var apply: @Sendable (SyncFieldValue) async -> Void = { _ in }
}

extension AccountCopy {
  init(key: SyncEntityKey, version: Int, value: Value) {
    self.key = key
    self.version = version
    self.value = value
  }
}

extension AccountSync {
  nonisolated static let photoNotUploaded = "photo_not_uploaded"
  nonisolated static let unknownPhoto = "unknown_photo"

  func observeKeptChanges() {
    let record: @MainActor @Sendable (KeptLocalChange) -> Void = { [weak self] change in
      self?.recordKept(change)
    }
    kept.notes.relay.observe(record)
    kept.media.relay.observe(record)
    kept.searches.relay.observe(record)
    kept.frequency.relay.observe(record)
    kept.settings.changeObserver = { [weak self] change in self?.recordKept(change) }
  }

  func keptUploads() async -> [SavedItemChange] {
    let notes = await kept.notes.keptNotes().map { KeptChanges.noteWritten($0, startedFrom: nil) }
    let media = await kept.media.keptPhotos()
    let profilePhoto = userProfile.photoData.map { [KeptChanges.profilePhotoSet($0.sha256)] } ?? []
    let frequency = await kept.frequency.changedFromStandard().map { [$0] } ?? []
    let changes =
      notes + media.photos.map(KeptChanges.photoAdded) + media.words.map(KeptChanges.photoWordAdded)
      + profilePhoto + kept.settings.changedFromStandard + frequency
    return changes.map(SavedItemChange.kept)
  }

  func identifyingSearch(_ change: SavedItemChange) -> SavedItemChange? {
    guard case .kept(let kept) = change, kept.key.entity == SyncEntity.recentSearch else {
      return change
    }
    return state.searchKey.flatMap { KeptChanges.search(kept, under: $0) }.map(SavedItemChange.kept)
  }

  func takeSearchKey(_ key: String?) async {
    guard let key, key != state.searchKey, Data(hexString: key) != nil else { return }
    let earlier = state.searchKey
    state.searchKey = key
    let searches = await kept.searches.searches()
    let removed = earlier.map { old in
      searches.compactMap { KeptChanges.search(KeptChanges.searchRemoved($0.query), under: old) }
    }
    let searched = searches.reversed().compactMap {
      KeptChanges.search(KeptChanges.searched($0), under: key)
    }
    state.queue += ((removed ?? []) + searched).map { SavedItemChange.kept($0).upload }
  }

  func isSendable(_ change: QueuedSyncChange) -> Bool {
    !state.holds(change.key) && !(filesWait && change.needsFile)
  }

  func uploadFiles(for batch: [QueuedSyncChange]) async throws -> [QueuedSyncChange] {
    var sendable: [QueuedSyncChange] = []
    for change in batch {
      guard isSendable(change) else { continue }
      guard let photoID = Self.fileUploaded(by: change) else {
        sendable.append(change)
        continue
      }
      guard let data = await heldFile(photoID) else {
        state.queue.removeAll { $0.id == change.id }
        continue
      }
      do {
        try await tokens.withAccessToken { [api] token in
          try await api.uploadPhoto(photoID, data: data, accessToken: token)
        }
        sendable.append(change)
      } catch AccountServiceError.refused(let status, _, _, _) where [409, 413, 415].contains(status) {
        state.queue.removeAll { $0.id == change.id }
      } catch AccountServiceError.refused(status: 503, _, _, _) {
        filesWait = true
      }
    }
    return sendable
  }

  private static func fileUploaded(by change: QueuedSyncChange) -> String? {
    switch (change.key.entity, change.operation, change.fields?["photoId"]) {
    case (SyncEntity.photo, "add", _): change.key.entityID
    case (SyncEntity.profilePhoto, "set", .string(let photoID)?): photoID
    default: nil
    }
  }

  private func heldFile(_ photoID: String) async -> Data? {
    if let data = await kept.media.fileData(photoID), data.sha256 == photoID { return data }
    return userProfile.photoData?.sha256 == photoID ? userProfile.photoData : nil
  }

  func keptConflict(_ change: QueuedSyncChange, current: SyncChange) -> Bool {
    guard change.key.entity == SyncEntity.wordNote, change.operation == "write",
      case .string(let mine)? = change.fields?["text"], let copy = AccountCopy(current),
      case .kept(.note(let theirs)) = copy.value, theirs.text != mine
    else { return false }
    apply(copy)
    let note = KeptNote(
      id: theirs.text == change.startedFrom ? theirs.id : UUID().uuidString.lowercased(),
      item: theirs.item, text: mine, headword: theirs.headword, reading: theirs.reading)
    keptToApply.append(
      AccountCopy(
        key: SyncEntityKey(entity: SyncEntity.wordNote, entityID: note.id), version: 0,
        value: .kept(.note(note))))
    state.enqueue(
      SavedItemChange.kept(KeptChanges.noteWritten(note, startedFrom: theirs.text))
        .queued(in: state))
    return true
  }

  func keptRejected(_ change: QueuedSyncChange, code: String) {
    switch code {
    case Self.photoNotUploaded:
      filesWait = true
      requeue(change)
    case Self.unknownPhoto:
      let photo = SyncEntityKey(
        entity: SyncEntity.photo, entityID: String(change.key.entityID.prefix { $0 != "/" }))
      if state.hasQueuedChange(to: photo) {
        requeue(change)
      } else if state.versions[photo.stored] != nil {
        keptToApply.append(AccountCopy(key: change.key, version: 0, value: .gone))
      }
    default:
      return
    }
  }

  private func requeue(_ change: QueuedSyncChange) {
    state.enqueue(
      QueuedSyncChange(
        id: UUID().uuidString.lowercased(), key: change.key, operation: change.operation,
        baseVersion: state.version(of: change.key), fields: change.fields))
  }

  func drainKept() async {
    while !keptToApply.isEmpty {
      let copy = keptToApply.removeFirst()
      await applyNow(copy)
    }
  }

  func retryWaitingFiles() async {
    let waiting = state.waitingFiles
    state.waitingFiles = []
    for copy in waiting where !state.hasQueuedChange(to: copy.key) { await applyNow(copy) }
  }

  private func applyNow(_ copy: AccountCopy) async {
    switch copy.value {
    case .kept(.note(let note)):
      await kept.notes.applySynced(note)
      await kept.notesChanged()
    case .kept(.photo(let photo)):
      await fetch(copy, photoID: photo.id)
    case .kept(.photoWord(let word)):
      state.heldPhotoWords.removeAll { $0.key == copy.key }
      if await kept.media.hasPhoto(word.photoID) {
        await kept.media.applySynced(word)
      } else {
        state.heldPhotoWords.append(copy)
      }
    case .kept(.profilePhoto(let photoID)):
      await fetch(copy, photoID: photoID)
    case .kept(.setting(let name, let value)):
      if name == FrequencyChoice.setting {
        await kept.frequency.apply(value)
      } else {
        kept.settings.applySynced(name, value)
      }
    case .kept(.recentSearch(let search)):
      guard let key = state.searchKey,
        KeptChanges.searchID(search.query, under: key) == copy.key.entityID
      else { return }
      await kept.searches.applySynced(search)
    case .gone:
      await removeKept(copy.key)
    default:
      return
    }
  }

  private func removeKept(_ key: SyncEntityKey) async {
    state.waitingFiles.removeAll { $0.key == key }
    state.missingFiles.removeAll { $0.key == key }
    switch key.entity {
    case SyncEntity.wordNote:
      await kept.notes.applySyncedRemoval(ofNote: key.entityID)
      await kept.notesChanged()
    case SyncEntity.photo:
      state.heldPhotoWords.removeAll { $0.key.entityID.hasPrefix("\(key.entityID)/") }
      await kept.media.applySyncedRemoval(ofPhoto: key.entityID)
    case SyncEntity.photoWord:
      state.heldPhotoWords.removeAll { $0.key == key }
      guard let slash = key.entityID.firstIndex(of: "/") else { return }
      await kept.media.applySyncedRemoval(
        ofWord: String(key.entityID[key.entityID.index(after: slash)...]),
        from: String(key.entityID[..<slash]))
    case SyncEntity.profilePhoto:
      userProfile.applySyncedPhotoRemoval()
    case SyncEntity.recentSearch:
      guard let searchKey = state.searchKey else { return }
      await kept.searches.applySyncedRemoval(ofSearch: key.entityID, under: searchKey)
    default:
      return
    }
  }

  private func fetch(_ copy: AccountCopy, photoID: String) async {
    state.waitingFiles.removeAll { $0.key == copy.key }
    state.missingFiles.removeAll { $0.key == copy.key }
    var file = await heldFile(photoID)
    if file == nil { file = await downloaded(copy, photoID: photoID) }
    guard let data = file else { return }
    switch copy.value {
    case .kept(.photo(let photo)):
      await kept.media.applySynced(photo, data: data)
      let held = state.heldPhotoWords.filter { $0.key.entityID.hasPrefix("\(photoID)/") }
      for word in held { await applyNow(word) }
    default:
      userProfile.applySyncedPhoto(data)
    }
  }

  private func downloaded(_ copy: AccountCopy, photoID: String) async -> Data? {
    do {
      let data = try await tokens.withAccessToken { [api] token in
        try await api.photo(photoID, accessToken: token)
      }
      if data.sha256 == photoID { return data }
    } catch AccountServiceError.refused(let status, _, _, _)
      where (400..<500).contains(status) && status != 429
    {
      state.missingFiles.append(copy)
      return nil
    } catch {}
    state.waitingFiles.append(copy)
    return nil
  }
}
