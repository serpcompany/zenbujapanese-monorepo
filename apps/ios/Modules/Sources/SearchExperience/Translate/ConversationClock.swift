import SwiftUI
import TranslatorCore

struct ConversationClock: View {
  let session: LiveConversation

  var body: some View {
    TimelineView(.periodic(from: .now, by: 1)) { context in
      Text(
        Duration.seconds(session.elapsed(at: context.date))
          .formatted(.time(pattern: .minuteSecond))
      )
      .font(.headline.monospacedDigit())
      .foregroundStyle(session.activity.isPaused ? Color.secondary : Color.red)
    }
  }
}
