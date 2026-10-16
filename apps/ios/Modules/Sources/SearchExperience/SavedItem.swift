import Foundation

struct SavedItem: Hashable, Sendable {
  enum Kind: Hashable, Sendable {
    case word(LanguageReferenceID)
    case kanji(KanjiCharacter)
  }

  let kind: Kind
  let headword: String
  let reading: String

  static func word(_ entry: DictionaryEntry) -> SavedItem {
    SavedItem(kind: .word(entry.id), headword: entry.headword, reading: entry.reading)
  }

  static func kanji(_ character: KanjiCharacter, reading: String) -> SavedItem {
    SavedItem(kind: .kanji(character), headword: character.rawValue, reading: reading)
  }

  var storedID: String {
    switch kind {
    case .word(let id): id.rawValue
    case .kanji(let character): Self.kanjiPrefix + character.rawValue
    }
  }

  var id: SavedItemID { SavedItemID(rawValue: storedID) }

  var encounterReference: EncounterWordReference {
    EncounterWordReference(id: id, headword: headword, reading: reading)
  }

  static func kanji(storedID: String) -> KanjiCharacter? {
    guard storedID.hasPrefix(kanjiPrefix) else { return nil }
    return KanjiCharacter(String(storedID.dropFirst(kanjiPrefix.count)))
  }

  fileprivate static let kanjiPrefix = "kanji:"
}

struct SavedItemID: Codable, Hashable, Comparable, Sendable {
  let rawValue: String

  var isNoteIdentity: Bool {
    !rawValue.hasPrefix(SavedItem.kanjiPrefix)
      && LanguageReferenceID(rawValue: rawValue).bytes == nil
  }

  static func < (lhs: SavedItemID, rhs: SavedItemID) -> Bool { lhs.rawValue < rhs.rawValue }
}
