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
    for photoID in batch.gonePhotos {
      state.heldPhotoWords.removeAll { $0.key.entityID.hasPrefix("\(photoID)/") }
      await kept.media.applySyncedRemoval(ofPhoto: photoID)
    }
    downloadsLeft += batch.photos.count
    for copy in batch.photos {
      guard self.session == session else { break }
      if case .kept(.photo(let photo)) = copy.value { await fetch(copy, photoID: photo.id, in: session) }
      downloadsLeft = max(0, downloadsLeft - 1)
    }
    guard self.session == session else { return }
    await kept.media.applySyncedRemoval(ofWords: batch.goneWords.compactMap(\.photoWordParts))
    await place(batch.words)
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
      await fetch(copy, photoID: photoID, in: session)
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

  private func fetch(_ copy: AccountCopy, photoID: String, in session: Int) async {
    var file = await heldFile(photoID)
    if file == nil, downloadsWait == nil { file = await downloaded(copy, photoID: photoID) }
    guard self.session == session else { return }
    guard let data = file else {
      if downloadsWait != nil, !state.missingFiles.contains(where: { $0.key == copy.key }) {
        state.waitingFiles.append(copy)
      }
      return
    }
    switch copy.value {
    case .kept(.photo(let photo)):
      guard await kept.media.applySynced(photo, data: data), self.session == session else {
        if self.session == session { state.waitingFiles.append(copy) }
        return
      }
      await place(state.heldPhotoWords.filter { $0.key.entityID.hasPrefix("\(photoID)/") })
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
    } catch AccountServiceError.refused(status: 429, _, _, let retryAfter) {
      downloadsWait = retryAfter ?? 1
      return nil
    } catch AccountServiceError.refused(let status, _, _, _) where (400..<500).contains(status) {
      state.missingFiles.append(copy)
      return nil
    } catch {}
    state.waitingFiles.append(copy)
    return nil
  }
}

extension AccountCopy {
  var photoWordParts: (item: String, mediaID: String)? {
    guard let slash = key.entityID.firstIndex(of: "/") else { return nil }
    return (String(key.entityID[key.entityID.index(after: slash)...]), String(key.entityID[..<slash]))
  }
}

extension KeptPhotoWord {
  var key: SyncEntityKey { KeptChanges.photoWordKey(photoID, item) }
}
