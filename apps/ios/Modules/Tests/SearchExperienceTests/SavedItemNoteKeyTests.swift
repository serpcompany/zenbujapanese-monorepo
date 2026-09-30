import Foundation
import Testing

@testable import SearchExperience

/// Notes and photos stay attached to a word when a dictionary update edits its meanings, because
/// they're saved under the word's Language Reference ID (ADR 0006), not a hash of its meanings.
@MainActor
@Suite("Saved item note keys")
struct SavedItemNoteKeyTests {
  private let iru = LanguageReferenceID(rawValue: "d12d09f1107aef0f7d43b54b62f0b7e1")

  @Test("a word's notes and photos are keyed by its Language Reference ID")
  func wordKey() {
    let item = SavedItem.word(entry(meanings: ["to be needed"]))
    #expect(item.noteID.rawValue == iru.rawValue)
    #expect(item.encounterReference.id == item.noteID)
  }

  @Test("editing a word's meanings keeps the same key")
  func keyIgnoresMeanings() {
    let before = SavedItem.word(entry(meanings: ["to be needed"]))
    let after = SavedItem.word(entry(meanings: ["to be needed", "to want"]))
    #expect(before.noteID == after.noteID)
  }

  @Test("a note saved before a meaning change loads after it")
  func notesSurviveMeaningChange() async {
    let store = InMemoryNoteStore()
    let notes = SavedItemNotes(store: store.client)

    await notes.load(SavedItem.word(entry(meanings: ["to be needed"])).noteID)
    notes.beginAdding()
    notes.draft = "Heard it in a drama"
    notes.finishEditing()
    await store.waitForSaves(1)

    let reloaded = SavedItemNotes(store: store.client)
    await reloaded.load(SavedItem.word(entry(meanings: ["to be needed", "to want"])).noteID)
    #expect(reloaded.notes.map(\.text) == ["Heard it in a drama"])
  }

  private func entry(meanings: [String]) -> DictionaryEntry {
    DictionaryEntry(
      id: iru,
      sourceProvenances: [
        LanguageReferenceProvenance(sourceIdentity: "edrdg.jmdict", sourceRecordID: "1546640")
      ],
      reading: "いる",
      headword: "要る",
      summary: meanings.joined(separator: ", "),
      meanings: meanings,
      partsOfSpeech: [.godanVerb],
      writtenForms: [],
      readingForms: [],
      senses: [],
      relationships: [],
      pitchAccent: nil,
      isCommon: true
    )
  }
}

private actor InMemoryNoteStore {
  private var notes: [SavedItemID: [LearnerWordNote]] = [:]
  private var saves = 0

  nonisolated var client: WordNoteStore {
    WordNoteStore(
      load: { id in await self.load(id) },
      save: { notes, id in await self.save(notes, id) }
    )
  }

  func load(_ id: SavedItemID) -> [LearnerWordNote] { notes[id] ?? [] }

  func save(_ saved: [LearnerWordNote], _ id: SavedItemID) {
    notes[id] = saved
    saves += 1
  }

  func waitForSaves(_ count: Int) async {
    while saves < count { await Task.yield() }
  }
}
