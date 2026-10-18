@testable import SearchExperience

extension DictionaryEntry {
  static func fixture(
    id: String, headword: String, reading: String? = nil, partsOfSpeech: [PartOfSpeech] = []
  ) -> DictionaryEntry {
    let record = LanguageReferenceProvenance(sourceIdentity: "fixture", sourceRecordID: id)
    return DictionaryEntry(
      id: LanguageReferenceID(rawValue: id),
      sourceRecord: record,
      sourceProvenances: [record],
      reading: reading ?? headword,
      headword: headword,
      summary: headword,
      meanings: [headword],
      partsOfSpeech: partsOfSpeech,
      writtenForms: [],
      readingForms: [],
      senses: [],
      relationships: [],
      pitch: nil,
      compoundPitch: nil,
      isCommon: false
    )
  }
}
