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
    defer { fixture.remove() }
    let id = LanguageReferenceID(rawValue: SavedWords.taberu.rawValue)
    let taberu = try #require(try await LookupClient.live.entry(id))
    let item = SavedItem.word(taberu)
    let edited = SavedItem.word(
      DictionaryEntry.fixture(id: id.rawValue, headword: taberu.headword, reading: taberu.reading))
    #expect(item.id == SavedWords.taberu)
    #expect(item.encounterReference.id == SavedWords.taberu)

    let temporary = try TemporaryDefaults()
    let notes = try storage(in: temporary, placing: .live)
    await notes.save(LearnerWordNote(text: "毎日食べる"), for: item.id)
    let photos = fixture.launch(placing: .live)
    await photos.save(fixture.photo, for: item.encounterReference)

    #expect(await notes.load(edited.id).map(\.text) == ["毎日食べる"])
    #expect(await photos.encounters(for: edited.encounterReference).map(\.id) == [fixture.photo.sha256])
  }

  @Test(
    "notes an earlier version saved under a word's note identity move to its Language Reference ID, and a kanji's stay"
  )
  func movesEarlierNotes() async throws {
    let temporary = try TemporaryDefaults()
    let shoku = SavedItem.kanji(try #require(KanjiCharacter("食")), reading: "ショク").id
    try keep(
      [
        SavedWords.taberuNoteIdentity: [LearnerWordNote(id: "1", text: "毎日食べる")],
        SavedWords.miruNoteIdentity: [LearnerWordNote(id: "2", text: "よく見る")],
        shoku.rawValue: [LearnerWordNote(id: "3", text: "食べ物の食")],
      ], in: temporary)
    let storage = try storage(in: temporary, placing: .live)

    #expect(await storage.load(SavedWords.taberu).map(\.text) == ["毎日食べる"])
    #expect(await storage.load(SavedWords.taberu).first?.headword == "食べる")
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
    try keep(
      [
        identities[1]: [LearnerWordNote(id: "2", text: "二つ目の閻魔")],
        identities[0]: [LearnerWordNote(id: "1", text: "一つ目の閻魔")],
      ], in: temporary)
    let storage = try storage(in: temporary, placing: .live)

    #expect(await storage.load(SavedWords.enma).map(\.text) == ["一つ目の閻魔", "二つ目の閻魔"])
    #expect(try storedKeys(in: temporary) == [SavedWords.enma])
  }

  @Test("a note under the other entry of a word JMdict lists twice moves to the one its page shows")
  func movesANoteToTheEntryItsPageShows() async throws {
    let temporary = try TemporaryDefaults()
    let note = LearnerWordNote(id: "1", text: "閻魔の別の見出し")
    try save([SavedWords.enmaOtherEntry.rawValue: [note]], in: temporary)
    let storage = try storage(in: temporary, placing: .live)

    #expect(await storage.load(SavedWords.enma) == [note.on("閻魔", reading: "えんま")])
    #expect(try storedKeys(in: temporary) == [SavedWords.enma])
  }

  @Test("a note without a word names the headword its page saved, a kanji's character, or else its key")
  @MainActor
  func namesTheWordOfANoteWithoutOne() async throws {
    let temporary = try TemporaryDefaults()
    try keep([SavedWords.goneNoteIdentity: [SavedWords.goneNote.note]], in: temporary)
    let storage = try storage(in: temporary, placing: SavedWords.lookup)
    let (store, saves) = SavedWords.observed(storage)
    var saved = saves.makeAsyncIterator()
    let page = SavedItemNotes(store: store)
    let dropped = SavedItem(
      kind: .word(LanguageReferenceID(rawValue: SavedWords.droppedWord.rawValue)),
      headword: "消えた語", reading: "きえたご")

    await page.load(dropped)
    page.beginAdding()
    page.draft = "辞書から消えた語"
    page.finishEditing()
    _ = await saved.next()
    await storage.save(LearnerWordNote(text: "辞書にない漢字"), for: SavedWords.droppedKanji)

    let relaunched = try self.storage(in: temporary, placing: SavedWords.lookup)
    let words = await relaunched.withoutAWord().map(\.word)
    #expect(words == ["消えた語", "丢", SavedWords.goneNoteIdentity])
  }

  @Test(
    "a note whose word this dictionary doesn't have is kept, listed as without a word, and can be deleted"
  )
  func keepsANoteWithoutAWord() async throws {
    let temporary = try TemporaryDefaults()
    let (gone, note) = (SavedWords.goneNote.key, SavedWords.goneNote.note)
    try keep([gone.rawValue: [note]], in: temporary)

    let launched = try storage(in: temporary, placing: .live)
    let withoutAWord = await launched.withoutAWord()

    #expect(withoutAWord == [SavedWords.goneNote])
    #expect(temporary.defaults.object(forKey: earlierKey) == nil)
    let relaunched = try storage(in: temporary, placing: .live)
    #expect(await relaunched.withoutAWord() == withoutAWord)
    await relaunched.save(LearnerWordNote(id: note.id, text: ""), for: gone)
    #expect(await relaunched.withoutAWord().isEmpty)
    #expect(try storedKeys(in: temporary).isEmpty)
  }

  @Test(
    "notes not placed while the dictionary couldn't be read aren't listed as without a word, and move at the next launch that can"
  )
  func placesNotesOnceTheDictionaryReads() async throws {
    let temporary = try TemporaryDefaults()
    try keep(
      [
        SavedWords.taberuNoteIdentity: [LearnerWordNote(id: "1", text: "毎日食べる")]
      ], in: temporary)

    let first = try storage(in: temporary, placing: SavedWords.unreadable)

    #expect(await first.load(SavedWords.taberu).isEmpty)
    #expect(await first.withoutAWord().isEmpty)
    #expect(temporary.defaults.object(forKey: earlierKey) == nil)
    let relaunched = try storage(in: temporary, placing: SavedWords.lookup)
    #expect(await relaunched.load(SavedWords.taberu).map(\.text) == ["毎日食べる"])
  }

  @Test("a note in both stores keeps its newer text, and the earlier store's other notes join it")
  func keepsTheNewerText() async throws {
    let temporary = try TemporaryDefaults()
    try save([SavedWords.taberu.rawValue: [LearnerWordNote(id: "1", text: "よく食べる")]], in: temporary)
    try keep(
      [
        SavedWords.taberuNoteIdentity: [
          LearnerWordNote(id: "1", text: "毎日食べる"), LearnerWordNote(id: "2", text: "朝ごはん"),
        ]
      ], in: temporary)
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
    let identities = SavedWords.enmaNoteIdentities
    let gone = SavedWords.goneNoteIdentity
    try writeEarlierIndex([
      (identities[0], "閻魔", "えんま", fixture.photo, 2),
      (identities[1], "閻魔", "えんま", fixture.photo, 2),
      (gone, "消えた", "きえた", fixture.otherPhoto, 1),
    ])
    let storage = fixture.launch(placing: .live)

    let enma = EncounterWordReference(id: SavedWords.enma, headword: "閻魔", reading: "えんま")
    #expect(await storage.encounters(for: enma).map(\.id) == [fixture.photo.sha256])
    let library = await storage.library()
    #expect(library.map(\.id) == [fixture.photo.sha256, fixture.otherPhoto.sha256])
    #expect(library.map { $0.words.map(\.id.rawValue) } == [[SavedWords.enma.rawValue], [gone]])
    #expect(library.last?.words.map(\.headword) == ["消えた"])
  }

  @Test("photos not placed while the dictionary couldn't be read stay listed, and move at the next launch that can")
  func placesPhotosOnceTheDictionaryReads() async throws {
    defer { fixture.remove() }
    try writeEarlierIndex([(SavedWords.taberuNoteIdentity, "食べる", "たべる", fixture.photo, 1)])

    let first = fixture.launch(placing: SavedWords.unreadable)

    #expect(await first.encounters(for: fixture.word).isEmpty)
    #expect(await first.library().flatMap(\.words).map(\.headword) == ["食べる"])
    let relaunched = fixture.launch(placing: SavedWords.lookup)
    #expect(await relaunched.encounters(for: fixture.word).map(\.id) == [fixture.photo.sha256])
  }

  @Test("an earlier store that isn't data is kept aside, and notes save as before")
  func keepsAnEarlierStoreThatIsntDataAside() async throws {
    let temporary = try TemporaryDefaults()
    temporary.defaults.set("not data", forKey: earlierKey)
    let storage = try storage(in: temporary, placing: SavedWords.lookup)

    await storage.save(LearnerWordNote(text: "新しいメモ"), for: SavedWords.taberu)

    #expect(await storage.load(SavedWords.taberu).map(\.text) == ["新しいメモ"])
    #expect(temporary.defaults.keptValues(of: earlierKey).compactMap { $0 as? String } == ["not data"])
    #expect(temporary.defaults.object(forKey: earlierKey) == nil)
  }

  @Test("Notes Without a Word lists each note whose word is gone until it's deleted")
  @MainActor
  func listsNotesWithoutAWordUntilDeleted() async throws {
    let temporary = try TemporaryDefaults()
    try keep(
      [
        SavedWords.goneNoteIdentity: [SavedWords.goneNote.note],
        SavedWords.taberuNoteIdentity: [LearnerWordNote(id: "2", text: "毎日食べる")],
      ], in: temporary)
    let storage = try storage(in: temporary, placing: SavedWords.lookup)
    let saved = NotesWithoutAWord(
      store: WordNoteStore(
        load: { await storage.load($0) }, save: { await storage.save($0, for: $1) },
        withoutAWord: { await storage.withoutAWord() }))

    await saved.reload()
    #expect(saved.notes == [SavedWords.goneNote])
    await saved.delete(try #require(saved.notes.first))
    #expect(saved.notes.isEmpty)
    #expect(await storage.load(SavedWords.taberu).map(\.text) == ["毎日食べる"])
  }

  private func writeEarlierIndex(
    _ encounters: [
      (identity: String, headword: String, reading: String, photo: EncounterMediaAttachment, savedAt: Int)
    ]
  ) throws {
    var media: [String] = []
    var records: [String] = []
    for encounter in encounters {
      let id = encounter.photo.sha256
      let record = #""\#(id)":{"name":"\#(encounter.photo.name)","savedAt":\#(encounter.savedAt)}"#
      if !media.contains(record) { media.append(record) }
      let word = #"{"id":{"rawValue":"\#(encounter.identity)"},"headword":"\#(encounter.headword)","reading":"\#(encounter.reading)"}"#
      records.append(#"{"word":\#(word),"mediaID":"\#(id)","savedAt":\#(encounter.savedAt)}"#)
    }
    _ = try fixture.writeIndex(
      #"{"media":{\#(media.joined(separator: ","))},"encounters":[\#(records.joined(separator: ","))]}"#)
    for attachment in [fixture.photo, fixture.otherPhoto] {
      try attachment.data.write(to: fixture.imageURL(of: attachment))
    }
  }

  private func keep(_ notes: [String: [LearnerWordNote]], in temporary: TemporaryDefaults) throws {
    temporary.defaults.set(try SavedWords.earlierNotes(notes), forKey: earlierKey)
  }

  private func save(_ notes: [String: [LearnerWordNote]], in temporary: TemporaryDefaults) throws {
    temporary.defaults.set(try SavedWords.earlierNotes(notes), forKey: WordNoteStorage.storageKey)
  }

  private func storage(in temporary: TemporaryDefaults, placing: SavedKeyLookup) throws
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
