import Foundation
import os

extension AccountSync {
  private static let logger = Logger(
    subsystem: Bundle.main.bundleIdentifier ?? "com.zenbujapanese.dictionary", category: "AccountSync")

  func readEverythingAgain(after refusal: AccountServiceError) throws {
    let reading = state.rereadSeen != nil
    state.cursor = nil
    state.heldWords = []
    state.deferred = [:]
    state.rereadSeen = []
    persist()
    guard reading else { return }
    Self.logger.warning("A read from no cursor was refused 410; it starts again after a wait")
    throw refusal
  }

  func notePhotoPlacesFreed(by changes: [SyncChange]) {
    let fullRead = state.rereadSeen != nil
    for change in changes where change.key.entity == SyncEntity.photo && !change.emptied {
      guard case .gone = change.payload else { continue }
      if state.versions[change.key.stored].map({ $0 < change.version }) ?? !fullRead {
        state.photoRoomFreed = true
      }
    }
  }

  func dropWhatTheFullReadDidntBring() {
    guard let seen = state.rereadSeen else { return }
    state.rereadSeen = nil
    for stored in Array(state.versions.keys) where !seen.contains(stored) {
      guard let key = SyncEntityKey(stored: stored), SyncEntity.forgotten.contains(key.entity),
        !state.hasQueuedChange(to: key)
      else { continue }
      state.versions[stored] = nil
      state.goneVideos.removeAll { $0 == stored }
      state.goneSearches.removeAll { $0 == stored }
      removeLocally(key)
    }
  }
}

extension AccountServiceError {
  var isInvalidCursor: Bool {
    if case .refused(status: 410, _, _, _) = self { return true }
    return false
  }
}

extension AccountSyncState {
  func keepsRefused(_ key: SyncEntityKey) -> Bool {
    switch key.entity {
    case SyncEntity.wordNote: refusedNotes.contains(key.entityID)
    case SyncEntity.photo, SyncEntity.photoWord:
      refusedPhotos[String(key.entityID.prefix { $0 != "/" })] != nil
    default: false
    }
  }
}
