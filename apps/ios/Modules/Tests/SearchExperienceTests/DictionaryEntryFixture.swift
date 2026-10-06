@testable import SearchExperience

extension DictionaryEntry {
  static func fixture(
    id: String, headword: String, reading: String? = nil, partsOfSpeech: [PartOfSpeech] = []
  ) -> DictionaryEntry {
    DictionaryEntry(
      id: LanguageReferenceID(rawValue: id),
      noteID: WordNoteID(rawValue: id),
      sourceProvenances: [
        LanguageReferenceProvenance(sourceIdentity: "fixture", sourceRecordID: id)
      ],
      reading: reading ?? headword,
      headword: headword,
      summary: headword,
      meanings: [headword],
      partsOfSpeech: partsOfSpeech,
      writtenForms: [],
      readingForms: [],
      senses: [],
      relationships: [],
      pitchAccent: nil,
      isCommon: false
    )
  }
}
