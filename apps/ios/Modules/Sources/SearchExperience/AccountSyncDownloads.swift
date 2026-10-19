import Foundation

private struct KeptBatch {
  var notes: [KeptNote] = []
  var goneNotes: [String] = []
  var searches: [KeptSearch] = []
  var goneSearches: [String] = []
  var photos: [AccountCopy] = []
  var gonePhotos: [String] = []
  var words: [AccountCopy] = []
  var goneWords: [AccountCopy] = []
  var singles: [AccountCopy] = []

  var touchesNotes: Bool { !notes.isEmpty || !goneNotes.isEmpty }
  var touchesSearches: Bool { !searches.isEmpty || !goneSearches.isEmpty }
}

extension AccountSync {
  var photosOnTheirWay: Int {
    downloadsLeft + state.waitingFiles.filter { $0.key.entity == SyncEntity.photo }.count
  }

  func drainKept(in session: Int) async {
    while !keptToApply.isEmpty, self.session == session {
      var latest: [String: AccountCopy] = [:]
      var order: [String] = []
      for copy in keptToApply {
        if latest.updateValue(copy, forKey: copy.key.stored) == nil { order.append(copy.key.stored) }
      }
      keptToApply = []
      await applyBatch(order.compactMap { latest[$0] }, in: session)
    }
  }

  func retryWaitingFiles(in session: Int) async {
    guard downloadsWait == nil else { return }
    let waiting = state.waitingFiles
    state.waitingFiles = waiting.filter { state.hasQueuedChange(to: $0.key) }
    await applyBatch(waiting.filter { !state.hasQueuedChange(to: $0.key) }, in: session)
  }

  private func applyBatch(_ copies: [AccountCopy], in session: Int) async {
    guard !copies.isEmpty else { return }
    let batch = sorted(copies)
    if batch.touchesNotes {
      await kept.notes.applySynced(batch.notes, removing: batch.goneNotes)
      await kept.notesChanged()
    }
    if batch.touchesSearches, let key = state.searchKey {
      await kept.searches.applySynced(batch.searches, removing: batch.goneSearches, under: key)
    }
    if !batch.gonePhotos.isEmpty { state.photoRoomFreed = true }
    for photoID in batch.gonePhotos {
      state.heldPhotoWords.removeAll { $0.key.entityID.hasPrefix("\(photoID)/") }
      await kept.media.applySyncedRemoval(ofPhoto: photoID)
    }
    downloadsLeft += batch.photos.count
    var stored: [(copy: AccountCopy, photo: KeptPhoto)] = []
    for copy in batch.photos {
      guard self.session == session, case .kept(.photo(let photo)) = copy.value else { return }
      let data = await file(for: copy, photoID: photo.id, in: session)
      guard self.session == session else { return }
      downloadsLeft = max(0, downloadsLeft - 1)
      if let data, await kept.media.storeFile(data, as: photo.id) {
        stored.append((copy, photo))
      } else if data != nil || downloadsWait != nil {
        state.waitingFiles.append(copy)
      }
    }
    guard self.session == session else { return }
    let saved = await kept.media.applySynced(photos: stored.map(\.photo))
    state.waitingFiles += stored.filter { !saved.contains($0.photo.id) }.map(\.copy)
    await kept.media.applySyncedRemoval(ofWords: batch.goneWords.compactMap(\.photoWordParts))
    let held = state.heldPhotoWords.filter { saved.contains($0.photoID) }
    await place(batch.words + held)
    for copy in batch.singles {
      guard self.session == session else { return }
      await applySingle(copy, in: session)
    }
    keptRevision += 1
  }

  private func sorted(_ copies: [AccountCopy]) -> KeptBatch {
    var batch = KeptBatch()
    for copy in copies {
      state.waitingFiles.removeAll { $0.key == copy.key }
      state.missingFiles.removeAll { $0.key == copy.key }
      let refused = state.refusedNotes.contains(copy.key.entityID)
      switch (copy.key.entity, copy.value) {
      case (SyncEntity.wordNote, _) where refused:
        continue
      case (_, .kept(.note(let note))):
        batch.notes.append(note)
      case (SyncEntity.wordNote, .gone):
        batch.goneNotes.append(copy.key.entityID)
      case (_, .kept(.recentSearch(let search))):
        guard let key = state.searchKey,
          KeptChanges.searchID(search.query, under: key) == copy.key.entityID
        else { continue }
        batch.searches.append(search)
      case (SyncEntity.recentSearch, .gone):
        batch.goneSearches.append(copy.key.entityID)
      case (_, .kept(.photo)):
        batch.photos.append(copy)
      case (SyncEntity.photo, .gone):
        batch.gonePhotos.append(copy.key.entityID)
      case (_, .kept(.photoWord)):
        batch.words.append(copy)
      case (SyncEntity.photoWord, .gone):
        state.heldPhotoWords.removeAll { $0.key == copy.key }
        batch.goneWords.append(copy)
      default:
        batch.singles.append(copy)
      }
    }
    return batch
  }

  private func place(_ words: [AccountCopy]) async {
    guard !words.isEmpty else { return }
    let keys = Set(words.map(\.key))
    state.heldPhotoWords.removeAll { keys.contains($0.key) }
    let kept = words.compactMap { copy -> KeptPhotoWord? in
      if case .kept(.photoWord(let word)) = copy.value { return word }
      return nil
    }
    let unplaced = Set(await self.kept.media.applySynced(words: kept).map(\.key))
    state.heldPhotoWords += words.filter { unplaced.contains($0.key) }
  }

  private func applySingle(_ copy: AccountCopy, in session: Int) async {
    switch copy.value {
    case .kept(.profilePhoto(let photoID)):
      await applyProfilePhoto(copy, photoID: photoID, in: session)
    case .kept(.setting(let name, let value)):
      if name == FrequencyChoice.setting {
        await kept.frequency.apply(value)
      } else {
        kept.settings.applySynced(name, value)
      }
    case .gone where copy.key.entity == SyncEntity.profilePhoto:
      userProfile.applySyncedPhotoRemoval()
    default:
      return
    }
  }

  private func file(for copy: AccountCopy, photoID: String, in session: Int) async -> Data? {
    if let held = await heldFile(photoID) { return held }
    guard downloadsWait == nil else { return nil }
    let answer: Result<Data, AccountServiceError>
    do {
      answer = .success(
        try await tokens.withAccessToken { [api] token in
          try await api.photo(photoID, accessToken: token)
        })
    } catch let failure as AccountServiceError {
      answer = .failure(failure)
    } catch {
      answer = .failure(.unreachable)
    }
    guard self.session == session else { return nil }
    switch answer {
    case .success(let data) where data.sha256 == photoID:
      return data
    case .failure(.refused(status: 429, _, _, let retryAfter)):
      downloadsWait = retryAfter ?? 1
    case .failure(.refused(let status, _, _, _)) where (400..<500).contains(status):
      state.missingFiles.append(copy)
    default:
      state.waitingFiles.append(copy)
    }
    return nil
  }

  private func applyProfilePhoto(_ copy: AccountCopy, photoID: String, in session: Int) async {
    let data = await file(for: copy, photoID: photoID, in: session)
    guard self.session == session else { return }
    guard let data else {
      if downloadsWait != nil { state.waitingFiles.append(copy) }
      return
    }
    userProfile.applySyncedPhoto(data)
  }
}

extension AccountCopy {
  var photoWordParts: (item: String, mediaID: String)? {
    guard let slash = key.entityID.firstIndex(of: "/") else { return nil }
    return (String(key.entityID[key.entityID.index(after: slash)...]), String(key.entityID[..<slash]))
  }
}

extension AccountCopy {
  var photoID: String { String(key.entityID.prefix { $0 != "/" }) }
}

extension KeptPhotoWord {
  var key: SyncEntityKey { KeptChanges.photoWordKey(photoID, item) }
}
