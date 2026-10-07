@testable import SearchExperience

extension FrequencyPackDisclosure {
  static func fixture(
    id: String, displayName: String, kind: FrequencyPackKind = .rank
  ) -> FrequencyPackDisclosure {
    FrequencyPackDisclosure(
      id: FrequencyPackID(rawValue: id), kind: kind, displayName: displayName, domain: "Fixture",
      domainDescription: "Fixture", version: "1", attribution: "Fixture")
  }
}

extension FrequencyEvidence {
  static func fixture(
    pack: FrequencyPackDisclosure, languageReferenceID: LanguageReferenceID, rank: Int
  ) -> FrequencyEvidence {
    FrequencyEvidence(
      pack: pack, languageReferenceID: languageReferenceID, rank: rank, coveredSourceRows: 1,
      sourceCount: 0, sourceTotalTokens: 0, sourceDocuments: nil, sourceVideos: nil,
      sourceChannels: nil, matchedForm: "fixture", sourcePartOfSpeech: nil,
      sourceRecordDigest: "fixture", mappingRelation: .exactWrittenReading)
  }
}
