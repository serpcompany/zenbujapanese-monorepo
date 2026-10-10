import Foundation

public struct TranslatedSentence: Codable, Sendable, Hashable, Identifiable {
  public let id: UUID
  public var text: String
  public var translation: String?
  public var isBookmarked: Bool
  public var bookmarkedAt: Date?

  public init(
    id: UUID = UUID(), text: String, translation: String? = nil, isBookmarked: Bool = false,
    bookmarkedAt: Date? = nil
  ) {
    self.id = id
    self.text = text
    self.translation = translation
    self.isBookmarked = isBookmarked
    self.bookmarkedAt = bookmarkedAt
  }

  public init(from decoder: any Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    id = try container.decode(UUID.self, forKey: .id)
    text = try container.decode(String.self, forKey: .text)
    translation = try container.decodeIfPresent(String.self, forKey: .translation)
    isBookmarked = try container.decodeIfPresent(Bool.self, forKey: .isBookmarked) ?? false
    bookmarkedAt = try container.decodeIfPresent(Date.self, forKey: .bookmarkedAt)
  }
}

public struct BookmarkedSentence: Sendable, Hashable, Identifiable {
  public let conversationID: UUID?
  public let language: SpokenLanguage
  public let sentence: TranslatedSentence
  public let bookmarkedAt: Date

  public var id: UUID { sentence.id }

  public var shared: SharedBookmark {
    SharedBookmark(
      id: sentence.id, text: sentence.text, translation: sentence.translation,
      language: language, bookmarkedAt: bookmarkedAt)
  }
}

public struct ConversationTurn: Codable, Sendable, Hashable, Identifiable {
  public let id: UUID
  public let language: SpokenLanguage
  public let startedAt: Date
  public var sentences: [TranslatedSentence]

  public init(
    id: UUID = UUID(),
    language: SpokenLanguage,
    startedAt: Date,
    sentences: [TranslatedSentence] = []
  ) {
    self.id = id
    self.language = language
    self.startedAt = startedAt
    self.sentences = sentences
  }

  public var text: String {
    language.joined(sentences.map(\.text))
  }
}

public struct Conversation: Codable, Sendable, Hashable, Identifiable {
  public static let currentVersion = 1

  public var version: Int
  public let id: UUID
  public let startedAt: Date
  public var updatedAt: Date
  public let mode: TranslateMode
  public var duration: TimeInterval
  public var turns: [ConversationTurn]

  public init(
    id: UUID = UUID(),
    startedAt: Date,
    mode: TranslateMode,
    turns: [ConversationTurn] = []
  ) {
    version = Self.currentVersion
    self.id = id
    self.startedAt = startedAt
    updatedAt = startedAt
    self.mode = mode
    duration = 0
    self.turns = turns
  }

  public var sentences: [TranslatedSentence] {
    turns.flatMap(\.sentences)
  }

  public var firstSentence: TranslatedSentence? {
    turns.lazy.compactMap(\.sentences.first).first
  }

  public var transcript: String {
    sentences
      .map { sentence in
        [sentence.text, sentence.translation].compactMap(\.self).joined(separator: "\n")
      }
      .joined(separator: "\n\n")
  }

  struct SentencePlace: Equatable {
    let turn: Int
    let sentence: Int
  }

  func place(of sentenceID: UUID) -> SentencePlace? {
    for (turn, spoken) in turns.enumerated() {
      if let sentence = spoken.sentences.firstIndex(where: { $0.id == sentenceID }) {
        return SentencePlace(turn: turn, sentence: sentence)
      }
    }
    return nil
  }

  func bookmark(at place: SentencePlace) -> BookmarkedSentence {
    let turn = turns[place.turn]
    let sentence = turn.sentences[place.sentence]
    return BookmarkedSentence(
      conversationID: id, language: turn.language, sentence: sentence,
      bookmarkedAt: sentence.bookmarkedAt ?? turn.startedAt)
  }

  var bookmarks: [BookmarkedSentence] {
    turns.indices.flatMap { turn in
      turns[turn].sentences.indices
        .filter { turns[turn].sentences[$0].isBookmarked }
        .map { bookmark(at: SentencePlace(turn: turn, sentence: $0)) }
    }
  }

  public func matches(_ query: String) -> Bool {
    let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !needle.isEmpty else { return true }
    return sentences.contains { sentence in
      sentence.text.localizedStandardContains(needle)
        || sentence.translation?.localizedStandardContains(needle) == true
    }
  }
}
