import Foundation

/// A dictionary word or a kanji the learner can mark known, add to a list, write notes about,
/// or attach photos to.
struct SavedItem: Hashable, Sendable {
  enum Kind: Hashable, Sendable {
    case word(LanguageReferenceID, noteID: WordNoteID)
    case kanji(KanjiCharacter)
  }

  let kind: Kind
  let headword: String
  let reading: String

  static func word(_ entry: DictionaryEntry) -> SavedItem {
    SavedItem(
      kind: .word(entry.id, noteID: entry.noteID), headword: entry.headword, reading: entry.reading)
  }

  static func kanji(_ character: KanjiCharacter, reading: String) -> SavedItem {
    SavedItem(kind: .kanji(character), headword: character.rawValue, reading: reading)
  }

  /// The ID Known Words and Lists save: a word's Language Reference ID, or `kanji:` followed by
  /// the character. The prefix can't collide with a Language Reference ID, which is hexadecimal.
  var storedID: String {
    switch kind {
    case .word(let id, _): id.rawValue
    case .kanji(let character): Self.kanjiPrefix + character.rawValue
    }
  }

  /// The key notes and photos are saved under.
  var noteID: WordNoteID {
    switch kind {
    case .word(_, let noteID): noteID
    case .kanji: WordNoteID(rawValue: storedID)
    }
  }

  var encounterReference: EncounterWordReference {
    EncounterWordReference(id: noteID, headword: headword, reading: reading)
  }

  /// The kanji a saved ID names, or nil when it names a word.
  static func kanji(storedID: String) -> KanjiCharacter? {
    guard storedID.hasPrefix(kanjiPrefix) else { return nil }
    return KanjiCharacter(String(storedID.dropFirst(kanjiPrefix.count)))
  }

  private static let kanjiPrefix = "kanji:"
}
