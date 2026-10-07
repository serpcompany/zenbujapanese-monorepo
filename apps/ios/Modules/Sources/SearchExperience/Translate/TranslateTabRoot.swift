import SwiftUI
import TranslatorCore

struct TranslateTabRoot: View {
  let experience: TranslateExperience
  let words: TranslateWordLinks
  let push: (TranslateRoute) -> Void

  var body: some View {
    Group {
      if let session = experience.session {
        LiveConversationView(session: session, experience: experience, words: words)
          .transition(.move(edge: .trailing))
      } else {
        TranslateHomeView(
          experience: experience,
          openHistory: { push(.history) },
          openText: { push(.text($0)) }
        )
        .transition(.move(edge: .leading))
      }
    }
    .animation(.smooth, value: experience.session == nil)
    .navigationDestination(for: TranslateRoute.self) { route in
      switch route {
      case .text(let text):
        TypedTranslationScreen(text: text, experience: experience, words: words)
      case .history:
        TranslateHistoryView(history: experience.history, transcript: transcriptActions)
      case .conversation(let id):
        TranslateConversationDetailView(
          conversationID: id, history: experience.history, actions: transcriptActions)
      }
    }
  }

  private var transcriptActions: TranscriptActions {
    TranscriptActions(
      words: words, readingAids: experience.readingAids,
      conversationWords: experience.conversationWords,
      speak: { text, language in
        Task { await experience.services.clients.playback.speak(text, language) }
      })
  }
}
