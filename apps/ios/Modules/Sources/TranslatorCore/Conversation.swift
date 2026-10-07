import Foundation

public struct TranslatedSentence: Codable, Sendable, Hashable, Identifiable {
  public let id: UUID
  public var text: String
  public var translation: String?

  public init(id: UUID = UUID(), text: String, translation: String? = nil) {
    self.id = id
    self.text = text
    self.translation = translation
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
  public var mode: TranslateMode
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

  public func matches(_ query: String) -> Bool {
    let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !needle.isEmpty else { return true }
    return sentences.contains { sentence in
      sentence.text.localizedStandardContains(needle)
        || sentence.translation?.localizedStandardContains(needle) == true
    }
  }
}
