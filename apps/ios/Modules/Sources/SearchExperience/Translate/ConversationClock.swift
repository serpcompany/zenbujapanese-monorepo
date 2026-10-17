import SwiftUI
import TranslatorCore

struct ConversationClock: View {
  let session: LiveConversation

  var body: some View {
    TimelineView(.periodic(from: .now, by: 1)) { _ in
      Text(
        Duration.seconds(session.elapsedSoFar)
          .formatted(.time(pattern: .minuteSecond))
      )
      .font(.headline.monospacedDigit())
      .foregroundStyle(session.activity.isPaused ? Color.secondary : Color.red)
    }
  }
}
