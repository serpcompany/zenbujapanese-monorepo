import Foundation
import OSLog

struct NoteIdentityLookup: Sendable {
  var words: @Sendable ([String]) async throws -> [String: LanguageReferenceID]

  static let live = NoteIdentityLookup { try await LanguageReferenceData.shared.words(named: $0) }

  private static let logger = Logger(
    subsystem: Bundle.main.bundleIdentifier ?? "com.zenbujapanese.dictionary",
    category: "NoteIdentityLookup")

  func wordIDs(for keys: some Sequence<SavedItemID>) async -> [SavedItemID: SavedItemID] {
    let identities = Set(keys.filter(\.isNoteIdentity).map(\.rawValue))
    guard !identities.isEmpty else { return [:] }
    let found: [String: LanguageReferenceID]
    do {
      found = try await words(identities.sorted())
    } catch {
      Self.logger.error("Couldn't read the words note identities name: \(error, privacy: .public)")
      return [:]
    }
    var placed: [SavedItemID: SavedItemID] = [:]
    for (identity, word) in found {
      placed[SavedItemID(rawValue: identity)] = SavedItemID(rawValue: word.rawValue)
    }
    return placed
  }
}
