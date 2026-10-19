import Foundation

extension AccountSync {
  static let filesPerRequest = 4

  func uploads() async -> [SavedItemChange] {
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
    let bookmarks = translations.bookmarks.reversed().map {
      SavedItemChange.bookmarkAdded($0.shared)
    }
    let kept = await keptUploads(withProfilePhoto: !state.takesAccountProfile)
    return marks + lists + words + videos + bookmarks + kept
  }

  func catchUpOnNewEntities() async {
    guard !caughtUpThisLaunch, let account else { return }
    caughtUpThisLaunch = true
    state.waitingFiles += state.missingFiles
    state.missingFiles = []
    for change in state.retryNextLaunch { requeue(change) }
    state.retryNextLaunch = []
    await requeueRefusedPhotos()
    await kept.frequency.resume()
    let entities = Set(SyncEntity.uploaded).subtracting(state.syncedEntities)
    guard !entities.isEmpty else { return }
    let changes = await uploads()
    let choice = entities.contains(SyncEntity.setting) ? await kept.frequency.changedFromStandard() : nil
    guard state.account == account else {
      caughtUpThisLaunch = false
      return
    }
    let first = (changes + (choice.map { [SavedItemChange.kept($0)] } ?? [])).map(\.upload)
    state.queue = first.filter { entities.contains($0.key.entity) } + state.queue
    state.syncedEntities = SyncEntity.uploaded
    state.cursor = nil
    state.heldWords = []
    state.deferred = [:]
    persist()
  }

  func nextBatch() -> [QueuedSyncChange] {
    var keys = Set<SyncEntityKey>()
    var waitingPhotos = Set<String>()
    var batch: [QueuedSyncChange] = []
    var bytes = 0
    var files = 0
    for change in state.queue where isSendable(change) {
      if change.key.entity == SyncEntity.photoWord, waitingPhotos.contains(change.photoID) {
        continue
      }
      if change.key.entity == SyncEntity.photo, Self.fileUploaded(by: change) != nil,
        !state.uploadedFiles.contains(change.key.entityID)
      {
        guard files < Self.filesPerRequest else {
          waitingPhotos.insert(change.key.entityID)
          continue
        }
        files += 1
      }
      bytes += (try? JSONEncoder().encode(change.payload).count) ?? 0
      guard batch.isEmpty || bytes <= Self.requestBytes, batch.count < Self.mutationsPerRequest,
        keys.insert(change.key).inserted
      else { break }
      batch.append(change)
    }
    return batch
  }

  func isSendable(_ change: QueuedSyncChange) -> Bool {
    !state.holds(change.key) && !(filesWait && change.needsFile)
  }

  func uploadFiles(for batch: [QueuedSyncChange]) async throws -> [QueuedSyncChange] {
    var sendable: [QueuedSyncChange] = []
    for change in batch {
      guard isSendable(change) else { continue }
      guard let photoID = Self.fileUploaded(by: change), !state.uploadedFiles.contains(photoID)
      else {
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
        photosUnavailable = false
        state.uploadedFiles.append(photoID)
        persist()
        sendable.append(change)
      } catch AccountServiceError.refused(let status, let code, _, _)
        where [409, 413, 415].contains(status)
      {
        state.queue.removeAll { $0.id == change.id }
        if change.key.entity == SyncEntity.photo { state.refusedPhotos[photoID] = code }
      } catch AccountServiceError.refused(status: 503, _, _, _) {
        filesWait = true
        photosUnavailable = true
      }
    }
    return sendable
  }

  static func fileUploaded(by change: QueuedSyncChange) -> String? {
    switch (change.key.entity, change.operation, change.fields?["photoId"]) {
    case (SyncEntity.photo, "add", _): change.key.entityID
    case (SyncEntity.profilePhoto, "set", .string(let photoID)?): photoID
    default: nil
    }
  }

  func requeue(_ change: QueuedSyncChange, at version: Int? = nil) {
    state.enqueue(
      QueuedSyncChange(
        id: UUID().uuidString.lowercased(), key: change.key, operation: change.operation,
        baseVersion: version ?? state.version(of: change.key), fields: change.fields))
  }

  private func requeueRefusedPhotos() async {
    let full = state.refusedPhotos.filter { $0.value == AccountSync.tooManyPhotos }.map(\.key)
    guard !full.isEmpty else { return }
    let media = await kept.media.keptPhotos()
    for photoID in full {
      state.refusedPhotos[photoID] = nil
      let changes =
        media.photos.filter { $0.id == photoID }.map(KeptChanges.photoAdded)
        + media.words.filter { $0.photoID == photoID }.map(KeptChanges.photoWordAdded)
      for change in changes { state.enqueue(SavedItemChange.kept(change).queued(in: state)) }
    }
  }
}

extension AccountSync {
  nonisolated static let tooManyPhotos = "too_many_photos"
}

extension QueuedSyncChange {
  var photoID: String { String(key.entityID.prefix { $0 != "/" }) }
}

extension SavedItemChange {
  var ridesAlong: Bool {
    guard case .kept(let change) = self else { return false }
    return change.key.entity == SyncEntity.recentSearch
  }
}

extension AccountSyncState {
  mutating func forgetRefusal(of change: SavedItemChange) {
    guard case .kept(let kept) = change else { return }
    switch kept.key.entity {
    case SyncEntity.wordNote: refusedNotes.removeAll { $0 == kept.key.entityID }
    case SyncEntity.photo where kept.operation == "delete": refusedPhotos[kept.key.entityID] = nil
    default: return
    }
  }
}
