import Foundation
import Observation
import TranslatorCore

@MainActor
@Observable
final class ConversationWords {
  private struct Counted {
    let updatedAt: Date
    let words: [LanguageReferenceID]
  }

  private var counted: [UUID: Counted] = [:]
  @ObservationIgnored private var counting: Set<UUID> = []

  func comprehension(
    of conversation: Conversation, analysis: JapaneseTextAnalysisClient,
    isKnown: (LanguageReferenceID) -> Bool
  ) -> Comprehension? {
    guard let entry = counted[conversation.id], entry.updatedAt == conversation.updatedAt else {
      count(conversation, analysis: analysis)
      return nil
    }
    let comprehension = Comprehension(words: entry.words, isKnown: isKnown)
    return comprehension.totalCount > 0 ? comprehension : nil
  }

  private func count(_ conversation: Conversation, analysis: JapaneseTextAnalysisClient) {
    guard !counting.contains(conversation.id) else { return }
    counting.insert(conversation.id)
    let spoken = conversation.turns.filter { $0.language == .japanese }.flatMap(\.sentences)
    Task {
      var words: [LanguageReferenceID] = []
      for sentence in spoken {
        let tokens = await analysis.linkedTokens(sentence.text, SearchQuery(""), nil)
        words += Comprehension.countedWords(in: tokens)
      }
      counted[conversation.id] = Counted(updatedAt: conversation.updatedAt, words: words)
      counting.remove(conversation.id)
    }
  }
}
