import Foundation
import Testing

@testable import SearchExperience

@Suite("Notes and photos saved under a word's note identity")
struct EarlierWordKeysTests {
  private let earlierKey = WordNoteStorage.earlierStorageKey
  private let fixture = MediaLibraryFixture()

  @Test(
    "a word's notes and photos are keyed by its Language Reference ID, so an edit to its meanings keeps them"
  )
  func keyedByLanguageReferenceID() async throws {
    let id = LanguageReferenceID(rawValue: SavedWords.taberu.rawValue)
    let taberu = try #require(try await LookupClient.live.entry(id))
    let item = SavedItem.word(taberu)
    #expect(item.id == SavedWords.taberu)
    #expect(item.encounterReference.id == SavedWords.taberu)

    let temporary = try TemporaryDefaults()
    let storage = try storage(in: temporary, placing: .live)
    await storage.save(LearnerWordNote(text: "毎日食べる"), for: item.id)
    let edited = DictionaryEntry.fixture(
      id: id.rawValue, headword: taberu.headword, reading: taberu.reading)
    #expect(edited.meanings != taberu.meanings)
    #expect(await storage.load(SavedItem.word(edited).id).map(\.text) == ["毎日食べる"])
  }

  @Test(
    "notes an earlier version saved under a word's note identity move to its Language Reference ID, and a kanji's stay"
  )
  func movesEarlierNotes() async throws {
    let temporary = try TemporaryDefaults()
    let shoku = SavedItem.kanji(try #require(KanjiCharacter("食")), reading: "ショク").id
    temporary.defaults.set(
      try SavedWords.earlierNotes([
        SavedWords.taberuNoteIdentity: [LearnerWordNote(id: "1", text: "毎日食べる")],
        SavedWords.miruNoteIdentity: [LearnerWordNote(id: "2", text: "よく見る")],
        shoku.rawValue: [LearnerWordNote(id: "3", text: "食べ物の食")],
      ]), forKey: earlierKey)
    let storage = try storage(in: temporary, placing: .live)

    #expect(await storage.load(SavedWords.taberu).map(\.text) == ["毎日食べる"])
    #expect(await storage.load(SavedWords.miru).map(\.text) == ["よく見る"])
    #expect(await storage.load(shoku).map(\.text) == ["食べ物の食"])
    #expect(await storage.withoutAWord().isEmpty)
    #expect(temporary.defaults.object(forKey: earlierKey) == nil)
    #expect(try storedKeys(in: temporary) == [SavedWords.taberu, SavedWords.miru, shoku])
  }

  @Test("a word JMdict lists twice keeps the notes saved under either entry's note identity")
  func keepsTheNotesOfBothEntries() async throws {
    let temporary = try TemporaryDefaults()
    let identities = SavedWords.enmaNoteIdentities
    temporary.defaults.set(
      try SavedWords.earlierNotes([
        identities[1]: [LearnerWordNote(id: "2", text: "二つ目の閻魔")],
        identities[0]: [LearnerWordNote(id: "1", text: "一つ目の閻魔")],
      ]), forKey: earlierKey)
    let storage = try storage(in: temporary, placing: .live)

    #expect(await storage.load(SavedWords.enma).map(\.text) == ["一つ目の閻魔", "二つ目の閻魔"])
    #expect(try storedKeys(in: temporary) == [SavedWords.enma])
  }

  @Test(
    "a note whose word this dictionary doesn't have is kept, listed as without a word, and can be deleted"
  )
  func keepsANoteWithoutAWord() async throws {
    let temporary = try TemporaryDefaults()
    let gone = SavedItemID(rawValue: SavedWords.goneNoteIdentity)
    let note = LearnerWordNote(id: "1", text: "その言葉は辞書にない")
    temporary.defaults.set(try SavedWords.earlierNotes([gone.rawValue: [note]]), forKey: earlierKey)

    let launched = try storage(in: temporary, placing: .live)
    let withoutAWord = await launched.withoutAWord()

    #expect(withoutAWord == [NoteWithoutAWord(key: gone, note: note)])
    #expect(temporary.defaults.object(forKey: earlierKey) == nil)
    let relaunched = try storage(in: temporary, placing: .live)
    #expect(await relaunched.withoutAWord() == withoutAWord)
    await relaunched.save(LearnerWordNote(id: note.id, text: ""), for: gone)
    #expect(await relaunched.withoutAWord().isEmpty)
    #expect(try storedKeys(in: temporary).isEmpty)
  }

  @Test("notes not placed while the dictionary couldn't be read move at the next launch that can")
  func placesNotesOnceTheDictionaryReads() async throws {
    let temporary = try TemporaryDefaults()
    temporary.defaults.set(
      try SavedWords.earlierNotes([
        SavedWords.taberuNoteIdentity: [LearnerWordNote(id: "1", text: "毎日食べる")]
      ]), forKey: earlierKey)

    let first = try storage(in: temporary, placing: SavedWords.unreadable)

    #expect(await first.load(SavedWords.taberu).isEmpty)
    #expect(temporary.defaults.object(forKey: earlierKey) == nil)
    let relaunched = try storage(in: temporary, placing: SavedWords.lookup)
    #expect(await relaunched.load(SavedWords.taberu).map(\.text) == ["毎日食べる"])
  }

  @Test("a note in both stores keeps its newer text, and the earlier store's other notes join it")
  func keepsTheNewerText() async throws {
    let temporary = try TemporaryDefaults()
    temporary.defaults.set(
      try SavedWords.earlierNotes([
        SavedWords.taberu.rawValue: [LearnerWordNote(id: "1", text: "よく食べる")]
      ]), forKey: WordNoteStorage.storageKey)
    temporary.defaults.set(
      try SavedWords.earlierNotes([
        SavedWords.taberuNoteIdentity: [
          LearnerWordNote(id: "1", text: "毎日食べる"), LearnerWordNote(id: "2", text: "朝ごはん"),
        ]
      ]), forKey: earlierKey)
    let storage = try storage(in: temporary, placing: SavedWords.lookup)

    #expect(await storage.load(SavedWords.taberu).map(\.text) == ["よく食べる", "朝ごはん"])
  }

  @Test("earlier notes that can't all be read are kept aside, and every readable note moves")
  func keepsUnreadableEarlierNotesAside() async throws {
    let temporary = try TemporaryDefaults()
    let taberu = SavedWords.taberuNoteIdentity
    let miru = SavedWords.miruNoteIdentity
    let stored = Data(
      #"{"\#(taberu)":[{"id":"1","text":"毎日食べる"}],"\#(miru)":"not notes"}"#.utf8)
    temporary.defaults.set(stored, forKey: earlierKey)
    let storage = try storage(in: temporary, placing: SavedWords.lookup)

    #expect(await storage.load(SavedWords.taberu).map(\.text) == ["毎日食べる"])
    #expect(temporary.defaults.keptCopies(of: earlierKey) == [stored])
    #expect(temporary.defaults.object(forKey: earlierKey) == nil)
  }

  @Test(
    "photos an earlier version saved under note identities show on their word, once each, and one whose word is gone stays in the Media Library"
  )
  func movesEarlierPhotos() async throws {
    defer { fixture.remove() }
    let (photo, other) = (fixture.photo.sha256, fixture.otherPhoto.sha256)
    let identities = SavedWords.enmaNoteIdentities
    let gone = SavedWords.goneNoteIdentity
    _ = try fixture.writeIndex(
      #"""
      {"media":{"\#(photo)":{"name":"ramen.jpg","savedAt":2},"\#(other)":{"name":"sushi.jpg","savedAt":1}},
      "encounters":[
      {"word":{"id":{"rawValue":"\#(identities[0])"},"headword":"閻魔","reading":"えんま"},"mediaID":"\#(photo)","savedAt":2},
      {"word":{"id":{"rawValue":"\#(identities[1])"},"headword":"閻魔","reading":"えんま"},"mediaID":"\#(photo)","savedAt":2},
      {"word":{"id":{"rawValue":"\#(gone)"},"headword":"消えた","reading":"きえた"},"mediaID":"\#(other)","savedAt":1}]}
      """#)
    for attachment in [fixture.photo, fixture.otherPhoto] {
      try attachment.data.write(to: fixture.imageURL(of: attachment))
    }
    let storage = fixture.launch(placing: .live)

    let enma = EncounterWordReference(id: SavedWords.enma, headword: "閻魔", reading: "えんま")
    #expect(await storage.encounters(for: enma).map(\.id) == [photo])
    let library = await storage.library()
    #expect(library.map(\.id) == [photo, other])
    #expect(library.map { $0.words.map(\.id.rawValue) } == [[SavedWords.enma.rawValue], [gone]])
    #expect(library.last?.words.map(\.headword) == ["消えた"])
  }

  private func storage(in temporary: TemporaryDefaults, placing: NoteIdentityLookup) throws
    -> WordNoteStorage
  {
    WordNoteStorage(
      defaults: try #require(UserDefaults(suiteName: temporary.suite)), placing: placing)
  }

  private func storedKeys(in temporary: TemporaryDefaults) throws -> Set<SavedItemID> {
    let data = try #require(temporary.defaults.data(forKey: WordNoteStorage.storageKey))
    let stored = try JSONDecoder().decode([String: [LearnerWordNote]].self, from: data)
    return Set(stored.keys.map(SavedItemID.init(rawValue:)))
  }
}
