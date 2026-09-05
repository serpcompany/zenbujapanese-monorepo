// Consumed public fields of the Swift types in SearchExperience.
// This is a presentation slice, not a new domain or a delivery/schema contract.
// Swift value wrappers retain rawValue; Swift optional values become T | null.
export interface LanguageReferenceID {
  readonly rawValue: string;
}
export interface LanguageReferenceProvenance {
  readonly sourceIdentity: string;
  readonly sourceRecordID: string;
}
export interface PartOfSpeech {
  readonly rawValue: string;
}
export interface DictionaryForm {
  readonly value: string;
  readonly kind: 'written' | 'reading';
  readonly labels: readonly string[];
}
export interface DictionarySense {
  readonly meaning: string;
  readonly notes: readonly string[];
  readonly partsOfSpeech: readonly PartOfSpeech[];
}
export interface PitchAccent {
  readonly downstep: number;
  readonly moraCount: number;
  readonly sourceIdentity: string;
}
export interface DictionaryEntry {
  readonly id: LanguageReferenceID;
  readonly sourceProvenances: readonly LanguageReferenceProvenance[];
  readonly reading: string;
  readonly headword: string;
  readonly summary: string;
  readonly partsOfSpeech: readonly PartOfSpeech[];
  readonly writtenForms: readonly DictionaryForm[];
  readonly readingForms: readonly DictionaryForm[];
  readonly senses: readonly DictionarySense[];
  readonly pitchAccent: PitchAccent | null;
  readonly isCommon: boolean;
}
export interface FrequencyPackID {
  readonly rawValue: string;
}
export interface FrequencyPackDisclosure {
  readonly id: FrequencyPackID;
  readonly displayName: string;
  readonly domain: string;
  readonly domainDescription: string;
  readonly version: string;
  readonly attribution: string;
}
export interface FrequencyEvidence {
  readonly pack: FrequencyPackDisclosure;
  readonly languageReferenceID: LanguageReferenceID;
  readonly rank: number;
  readonly coveredSourceRows: number;
  readonly sourceCount: number;
  readonly sourceTotalTokens: number;
  readonly sourceDocuments: number | null;
  readonly sourceVideos: number | null;
  readonly sourceChannels: number | null;
  readonly matchedForm: string;
  readonly sourcePartOfSpeech: string | null;
  readonly sourceRecordDigest: string;
  readonly mappingRelation:
    | 'exactWrittenReading'
    | 'exactReading'
    | 'exactReadingPOS'
    | 'exactWrittenPOS'
    | 'uniqueFormFallback';
}
export interface ExampleSentenceID {
  readonly rawValue: string;
}
export interface ExampleSentence {
  readonly id: ExampleSentenceID;
  readonly japanese: string;
  readonly english: string;
}
