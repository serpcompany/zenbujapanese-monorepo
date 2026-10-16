import Foundation

@testable import SearchExperience

enum SavedWords {
  static let taberu = SavedItemID(rawValue: "042e07f7052f611fed33ddddf37f55fd")
  static let taberuNoteIdentity =
    "wn1:a476a5b74172562c7455ab211d7a65165f34ce33883799b59cf495761fde7271"
  static let taberuItem = SavedItem(
    kind: .word(LanguageReferenceID(rawValue: taberu.rawValue)), headword: "食べる", reading: "たべる")
  static let miru = SavedItemID(rawValue: "7f490a9c9c0da94f4e9474f4efe74be1")
  static let miruNoteIdentity =
    "wn1:eef063da3df9a6110f5a0710571fdbb06030a01688d3b81d91f899152ea3f626"
  static let enma = SavedItemID(rawValue: "176f4e451cc248ec386ac35f98801f36")
  static let enmaOtherEntry = SavedItemID(rawValue: "fc99db6b36d7725f21e054e1a4f745e7")
  static let enmaNoteIdentities = [
    "wn1:344c94836ac9a80e679ce27db9fbadc7e3802cb38eebf7bb3b345962075e789d:1",
    "wn1:344c94836ac9a80e679ce27db9fbadc7e3802cb38eebf7bb3b345962075e789d:2",
  ]
  static let goneNoteIdentity = "wn1:" + String(repeating: "0", count: 64)
  static let goneNote = NoteWithoutAWord(
    key: SavedItemID(rawValue: goneNoteIdentity),
    note: LearnerWordNote(id: "1", text: "その言葉は辞書にない"))
  static let droppedWord = SavedItemID(rawValue: String(repeating: "f", count: 32))
  static let droppedKanji = SavedItemID(rawValue: "kanji:丢")

  private static let labels = [
    taberu: SavedWordLabel(id: taberu, headword: "食べる", reading: "たべる"),
    miru: SavedWordLabel(id: miru, headword: "見る", reading: "みる"),
    enma: SavedWordLabel(id: enma, headword: "閻魔", reading: "えんま"),
  ]

  static let lookup = SavedKeyLookup(
    noteIdentities: { identities in
      let named = [taberuNoteIdentity: taberu, miruNoteIdentity: miru]
        .merging(enmaNoteIdentities.map { ($0, enma) }) { first, _ in first }
      return named.filter { identities.contains($0.key) }.compactMapValues { labels[$0] }
    },
    words: { ids in
      let shown = [taberu: taberu, miru: miru, enma: enma, enmaOtherEntry: enma]
      return Dictionary(
        uniqueKeysWithValues: ids.compactMap { id in
          shown[SavedItemID(rawValue: id)].flatMap { labels[$0] }.map { (id, $0) }
        })
    },
    kanji: { characters in Set(characters).subtracting([droppedKanji.kanji ?? ""]) }
  )

  static let unreadable = SavedKeyLookup(
    noteIdentities: { _ in throw LookupDatabaseError.missingBundledData },
    words: { _ in throw LookupDatabaseError.missingBundledData },
    kanji: { _ in throw LookupDatabaseError.missingBundledData }
  )

  static func observed(_ storage: WordNoteStorage) -> (WordNoteStore, AsyncStream<String>) {
    let (saves, saved) = AsyncStream<String>.makeStream()
    let store = WordNoteStore(
      load: { await storage.load($0) },
      save: { note, id in
        await storage.save(note, for: id)
        saved.yield(note.id)
      },
      withoutAWord: { await storage.withoutAWord() })
    return (store, saves)
  }

  static func earlierNotes(_ notes: [String: [LearnerWordNote]]) throws -> Data {
    try JSONEncoder().encode(notes)
  }
}
