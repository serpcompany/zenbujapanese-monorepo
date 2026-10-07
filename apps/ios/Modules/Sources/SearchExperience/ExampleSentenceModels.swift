import Foundation

struct ExampleSentenceID: RawRepresentable, Hashable, Comparable, Sendable {
  static let prefix = "esp1_"
  static let encodedByteCount = 16

  let rawValue: String

  init?(rawValue: String) {
    guard rawValue.count == Self.prefix.count + (Self.encodedByteCount * 2),
      rawValue.hasPrefix(Self.prefix),
      rawValue.dropFirst(Self.prefix.count).allSatisfy({ Self.isLowercaseASCIIHexDigit($0) })
    else { return nil }
    self.rawValue = rawValue
  }

  init?(bytes: UnsafeRawBufferPointer) {
    guard bytes.count == Self.encodedByteCount else { return nil }
    let hex = bytes.hexString
    self.init(rawValue: Self.prefix + hex)
  }

  static func < (left: Self, right: Self) -> Bool {
    left.rawValue < right.rawValue
  }

  private static func isLowercaseASCIIHexDigit(_ character: Character) -> Bool {
    ("0"..."9").contains(character) || ("a"..."f").contains(character)
  }
}

struct ExampleSentence: Hashable, Identifiable, Sendable {
  let id: ExampleSentenceID
  let japanese: String
  let english: String
}

enum ExampleSentenceRetrievalRequest: Hashable, Sendable {
  case directEnglish(SearchQuery)
  case directJapanese(SearchQuery)
  case dictionaryEntry(
    LanguageReferenceID,
    selectedForm: String,
    writtenForms: [String],
    reading: String
  )

  static func dictionaryEntry(_ entry: DictionaryEntry) -> Self {
    .dictionaryEntry(
      entry.id,
      selectedForm: entry.headword,
      writtenForms: entry.writtenForms.map(\.value),
      reading: entry.reading
    )
  }
}

enum ExampleSentenceRetrievalRoute: String, Hashable, Sendable {
  case directEnglish
  case directJapanese
  case dictionaryEntry
}

enum ExampleSentenceLexicalRelation: Int, Hashable, Sendable {
  case exactSurfacePhrase = 0
  case porterEquivalentPhrase = 1
  case entireJapaneseSentence = 2
  case containedJapaneseSurface = 3
  case selectedWrittenForm = 4
  case alternateWrittenForm = 5
  case reading = 6
}

struct ExampleSentenceMatchedRange: Hashable, Sendable {
  let location: Int
  let length: Int
}

struct ExampleSentenceRankInputs: Hashable, Sendable {
  let lexicalRelation: ExampleSentenceLexicalRelation
  let matchPosition: Int
  let englishTermCount: Int
  let japaneseGraphemeCount: Int
  let pairID: ExampleSentenceID
}

struct ExampleSentenceMatch: Hashable, Identifiable, Sendable {
  var id: ExampleSentenceID { sentence.id }
  let sentence: ExampleSentence
  let route: ExampleSentenceRetrievalRoute
  let lexicalRelation: ExampleSentenceLexicalRelation
  let matchedRange: ExampleSentenceMatchedRange
  let exactSurface: Bool
  let rankInputs: ExampleSentenceRankInputs
}

enum ExampleSentenceResultCount: Hashable, Sendable {
  case exact(Int)
  case moreThan50

  var compatibilityValue: Int {
    switch self {
    case .exact(let count): count
    case .moreThan50: 51
    }
  }
}

struct ExampleSentenceRetrievalResult: Hashable, Sendable {
  let matches: [ExampleSentenceMatch]
  let count: ExampleSentenceResultCount
  let isTruncated: Bool
  let policyVersion: String

  var sentences: [ExampleSentence] { matches.map(\.sentence) }
}

enum ExampleSentenceInvalidQueryReason: Hashable, Sendable {
  case empty
  case wrongLanguage
  case embeddedQuote
  case noPorterTerms
  case missingEntryEvidence
}

enum ExampleSentenceRetrievalUnavailableReason: Hashable, Sendable {
  case missingBundledData
  case invalidBaseCorpus
  case invalidIndexMetadata
  case unavailableFTS4Porter
  case queryFailed
}

enum ExampleSentenceRetrievalError: Error, Hashable, Sendable {
  case invalidQuery(ExampleSentenceInvalidQueryReason)
  case retrievalUnavailable(ExampleSentenceRetrievalUnavailableReason)
}
