import Foundation

@testable import SearchExperience

enum SavedWords {
  static let taberu = SavedItemID(rawValue: "042e07f7052f611fed33ddddf37f55fd")
  static let taberuNoteIdentity =
    "wn1:a476a5b74172562c7455ab211d7a65165f34ce33883799b59cf495761fde7271"
  static let miru = SavedItemID(rawValue: "7f490a9c9c0da94f4e9474f4efe74be1")
  static let miruNoteIdentity =
    "wn1:eef063da3df9a6110f5a0710571fdbb06030a01688d3b81d91f899152ea3f626"
  static let enma = SavedItemID(rawValue: "176f4e451cc248ec386ac35f98801f36")
  static let enmaNoteIdentities = [
    "wn1:344c94836ac9a80e679ce27db9fbadc7e3802cb38eebf7bb3b345962075e789d:1",
    "wn1:344c94836ac9a80e679ce27db9fbadc7e3802cb38eebf7bb3b345962075e789d:2",
  ]
  static let goneNoteIdentity = "wn1:" + String(repeating: "0", count: 64)
  static let goneNote = NoteWithoutAWord(
    key: SavedItemID(rawValue: goneNoteIdentity),
    note: LearnerWordNote(id: "1", text: "その言葉は辞書にない"))

  static let lookup = NoteIdentityLookup { identities in
    let named = [taberuNoteIdentity: taberu, miruNoteIdentity: miru]
      .merging(enmaNoteIdentities.map { ($0, enma) }) { first, _ in first }
    return named.filter { identities.contains($0.key) }
      .mapValues { LanguageReferenceID(rawValue: $0.rawValue) }
  }

  static let unreadable = NoteIdentityLookup { _ in throw LookupDatabaseError.missingBundledData }

  static func earlierNotes(_ notes: [String: [LearnerWordNote]]) throws -> Data {
    try JSONEncoder().encode(notes)
  }
}
