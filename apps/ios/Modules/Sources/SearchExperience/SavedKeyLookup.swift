import Foundation
import OSLog

struct SavedWordLabel: Hashable, Sendable {
  let id: SavedItemID
  let headword: String
  let reading: String
}

struct SavedKeyPlaces: Sendable {
  var words: [SavedItemID: SavedWordLabel] = [:]
  var missing: Set<SavedItemID> = []
}

struct SavedKeyLookup: Sendable {
  var noteIdentities: @Sendable ([String]) async throws -> [String: SavedWordLabel]
  var words: @Sendable ([String]) async throws -> [String: SavedWordLabel]
  var kanji: @Sendable ([String]) async throws -> Set<String>

  static let live = SavedKeyLookup(
    noteIdentities: { try await LanguageReferenceData.shared.words(named: $0) },
    words: { try await LanguageReferenceData.shared.shownWords($0) },
    kanji: { characters in Set(characters.filter { KanjiFiles.bundled?.entry($0) != nil }) }
  )

  private static let logger = Logger(
    subsystem: Bundle.main.bundleIdentifier ?? "com.zenbujapanese.dictionary",
    category: "SavedKeyLookup")

  func places(for keys: some Sequence<SavedItemID>) async -> SavedKeyPlaces? {
    let keys = Set(keys)
    let identities = keys.filter(\.isNoteIdentity).map(\.rawValue).sorted()
    let ids = keys.filter(\.isLanguageReferenceID).map(\.rawValue).sorted()
    let characters = keys.compactMap(\.kanji).sorted()
    let named: [String: SavedWordLabel]
    let shown: [String: SavedWordLabel]
    let kanjiFound: Set<String>
    do {
      named = identities.isEmpty ? [:] : try await noteIdentities(identities)
      shown = ids.isEmpty ? [:] : try await words(ids)
      kanjiFound = characters.isEmpty ? [] : try await kanji(characters)
    } catch {
      Self.logger.error("Couldn't look up the words of saved notes: \(error, privacy: .public)")
      return nil
    }
    var places = SavedKeyPlaces()
    for key in keys {
      if let character = key.kanji {
        if !kanjiFound.contains(character) { places.missing.insert(key) }
      } else if let word = named[key.rawValue] ?? shown[key.rawValue] {
        places.words[key] = word
      } else {
        places.missing.insert(key)
      }
    }
    return places
  }
}
