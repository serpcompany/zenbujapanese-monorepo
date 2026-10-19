import Foundation

@MainActor
struct KeptStores {
  let notes: WordNoteStorage
  let media: EncounterMediaStorage
  let searches: RecentSearchHistory
  let settings: SyncedSettings
  var notesChanged: @MainActor @Sendable () async -> Void = {}

  static var shared: KeptStores {
    KeptStores(
      notes: .shared, media: .shared, searches: .shared, settings: .shared,
      notesChanged: { await LearnerNotes.shared.reload() })
  }
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

  func observeKeptChanges() {
    let record: @MainActor @Sendable (KeptLocalChange) -> Void = { [weak self] change in
      self?.recordKept(change)
    }
    kept.notes.relay.observe(record)
    kept.media.relay.observe(record)
    kept.searches.relay.observe(record)
    kept.settings.changeObserver = { [weak self] change in self?.recordKept(change) }
  }

  func keptUploads() async -> [SavedItemChange] {
    let notes = await kept.notes.keptNotes().map { KeptChanges.noteWritten($0, startedFrom: nil) }
    let media = await kept.media.keptPhotos()
    let profilePhoto = userProfile.photoData.map { [KeptChanges.profilePhotoSet($0.sha256)] } ?? []
    let searches = await kept.searches.searches().reversed().map(KeptChanges.searched)
    let changes =
      notes + media.photos.map(KeptChanges.photoAdded) + media.words.map(KeptChanges.photoWordAdded)
      + profilePhoto + kept.settings.changedFromStandard + searches
    return changes.map(SavedItemChange.kept)
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
      guard let data = await fileData(photoID, for: change.key) else {
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

  private func fileData(_ photoID: String, for key: SyncEntityKey) async -> Data? {
    let data =
      key.entity == SyncEntity.profilePhoto
      ? userProfile.photoData : await kept.media.fileData(photoID)
    return data?.sha256 == photoID ? data : nil
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
    guard code == Self.photoNotUploaded else { return }
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
      kept.settings.applySynced(name, value)
    case .kept(.recentSearch(let search)):
      await kept.searches.applySynced(search)
    case .gone:
      await removeKept(copy.key)
    default:
      return
    }
  }

  private func removeKept(_ key: SyncEntityKey) async {
    state.waitingFiles.removeAll { $0.key == key }
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
      await kept.searches.applySyncedRemoval(ofSearch: key.entityID)
    default:
      return
    }
  }

  private func fetch(_ copy: AccountCopy, photoID: String) async {
    state.waitingFiles.removeAll { $0.key == copy.key }
    let data: Data
    do {
      data = try await tokens.withAccessToken { [api] token in
        try await api.photo(photoID, accessToken: token)
      }
    } catch AccountServiceError.refused(status: 404, _, _, _) {
      let gone =
        copy.key.entity == SyncEntity.photo
        ? KeptChanges.photoDeleted(photoID) : KeptChanges.profilePhotoRemoved
      return state.enqueue(SavedItemChange.kept(gone).queued(in: state))
    } catch {
      return state.waitingFiles.append(copy)
    }
    guard data.sha256 == photoID else { return state.waitingFiles.append(copy) }
    switch copy.value {
    case .kept(.photo(let photo)):
      await kept.media.applySynced(photo, data: data)
      let held = state.heldPhotoWords.filter { $0.key.entityID.hasPrefix("\(photoID)/") }
      for word in held { await applyNow(word) }
    default:
      userProfile.applySyncedPhoto(data)
    }
  }
}
