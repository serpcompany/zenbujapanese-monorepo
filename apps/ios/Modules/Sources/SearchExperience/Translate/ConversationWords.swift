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
  @ObservationIgnored private var counting: [UUID: Task<Void, Never>] = [:]

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
    guard counting[conversation.id] == nil else { return }
    let spoken = conversation.turns.filter { $0.language == .japanese }
      .flatMap(\.sentences).map(\.text)
    counting[conversation.id] = Task {
      let words = await Comprehension.countedWords(in: spoken, analysis: analysis) ?? []
      counted[conversation.id] = Counted(updatedAt: conversation.updatedAt, words: words)
      counting[conversation.id] = nil
    }
  }

  func countingFinished() async {
    for task in counting.values { await task.value }
  }
}
