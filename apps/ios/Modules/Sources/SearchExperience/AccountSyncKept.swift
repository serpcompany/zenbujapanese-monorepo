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
  var resume: @Sendable () async -> Void = {}
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
  nonisolated static let keptOnTheDevice: Set<String> = [
    "invalid_fields", "too_many_notes", "unknown_setting",
  ]

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

  func keptUploads(withProfilePhoto: Bool) async -> [SavedItemChange] {
    let notes = await kept.notes.keptNotes().map { KeptChanges.noteWritten($0, startedFrom: nil) }
    let media = await kept.media.keptPhotos()
    let profilePhoto =
      withProfilePhoto
      ? userProfile.photoData.map { [KeptChanges.profilePhotoSet($0.sha256)] } ?? [] : []
    let changes =
      notes + media.photos.map(KeptChanges.photoAdded) + media.words.map(KeptChanges.photoWordAdded)
      + profilePhoto + kept.settings.changedFromStandard
    return changes.map(SavedItemChange.kept)
  }

  func identifyingSearch(_ change: SavedItemChange) -> SavedItemChange? {
    guard case .kept(let kept) = change, kept.key.entity == SyncEntity.recentSearch else {
      return change
    }
    guard let searchKey = state.searchKey else {
      let query = kept.key.entityID
      state.searchRemovalsBeforeKey.removeAll { $0 == query }
      if kept.operation == "remove" { state.searchRemovalsBeforeKey.append(query) }
      return nil
    }
    return KeptChanges.search(kept, under: searchKey).map(SavedItemChange.kept)
  }

  func takeSearchKey(_ key: String?) async {
    guard let key, key != state.searchKey, Data(hexString: key) != nil else { return }
    let earlier = state.searchKey
    state.searchKey = key
    let searches = await kept.searches.searches()
    let removed = earlier.map { old in
      searches.compactMap { KeptChanges.search(KeptChanges.searchRemoved($0.query), under: old) }
    }
    let kept = Set(searches.map(\.query))
    let removedBefore = state.searchRemovalsBeforeKey.filter { !kept.contains($0) }
      .compactMap { KeptChanges.search(KeptChanges.searchRemoved($0), under: key) }
    state.searchRemovalsBeforeKey = []
    let searched = searches.reversed().compactMap {
      KeptChanges.search(KeptChanges.searched($0), under: key)
    }
    state.queue += ((removed ?? []) + removedBefore + searched).map {
      SavedItemChange.kept($0).upload
    }
  }

  func heldFile(_ photoID: String) async -> Data? {
    if let data = await kept.media.fileData(photoID), data.sha256 == photoID { return data }
    return userProfile.photoData?.sha256 == photoID ? userProfile.photoData : nil
  }

  func keptConflict(_ change: QueuedSyncChange, current: SyncChange) -> Bool {
    guard SyncEntity.kept.contains(change.key.entity), let copy = AccountCopy(current) else {
      return false
    }
    switch (change.key.entity, copy.value) {
    case (SyncEntity.setting, .gone):
      requeue(change, at: copy.version)
      return true
    case (SyncEntity.profilePhoto, .gone) where change.operation == "set" && change.baseVersion == 0:
      requeue(change, at: copy.version)
      return true
    case (SyncEntity.wordNote, .kept(.note(let theirs))):
      return noteConflict(change, theirs: theirs, copy: copy)
    default:
      return false
    }
  }

  private func noteConflict(_ change: QueuedSyncChange, theirs: KeptNote, copy: AccountCopy) -> Bool
  {
    guard change.operation == "write", case .string(let mine)? = change.fields?["text"],
      theirs.text != mine, !state.hasQueuedChange(to: change.key)
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
    switch (change.key.entity, code) {
    case (_, Self.photoNotUploaded):
      filesWait = true
      requeue(change)
    case (SyncEntity.photoWord, Self.unknownPhoto):
      let photo = SyncEntityKey(entity: SyncEntity.photo, entityID: change.photoID)
      if state.hasQueuedChange(to: photo) {
        requeue(change)
      } else if state.versions[photo.stored] != nil {
        keptToApply.append(AccountCopy(key: change.key, version: 0, value: .gone))
      }
    case (SyncEntity.wordNote, let code) where Self.keptOnTheDevice.contains(code):
      if !state.refusedNotes.contains(change.key.entityID) {
        state.refusedNotes.append(change.key.entityID)
      }
      if case .string(let text)? = change.fields?["text"],
        !state.longNotes.contains(change.key.entityID),
        !AccountRules.shared.noteFitsTheAccount(text)
      {
        state.longNotes.append(change.key.entityID)
      }
    case (SyncEntity.setting, let code) where Self.keptOnTheDevice.contains(code):
      state.retryNextLaunch.removeAll { $0.key == change.key }
      state.retryNextLaunch.append(change)
    default:
      return
    }
  }
}
