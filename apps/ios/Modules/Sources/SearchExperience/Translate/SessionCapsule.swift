import SwiftUI
import TranslatorCore

struct SessionCapsuleContent: View {
  let session: LiveConversation
  let status: String?

  var body: some View {
    HStack(spacing: 12) {
      VStack(alignment: .leading, spacing: 1) {
        ConversationClock(session: session)
        if let status {
          Text(status)
            .font(.subheadline.weight(.semibold))
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .accessibilityIdentifier("translate.session.status")
        }
      }
      if status != nil { Spacer(minLength: 8) }
      Button {
        if session.activity.isPaused { session.start() } else { session.pause() }
      } label: {
        Image(systemName: session.activity.isPaused ? "play.fill" : "pause.fill")
          .font(.body.weight(.semibold))
          .foregroundStyle(session.activity.isPaused ? Color.accentColor : Color.red)
          .frame(width: 38, height: 38)
          .overlay { Circle().strokeBorder(.primary, lineWidth: 2) }
          .contentShape(.circle)
      }
      .buttonStyle(.plain)
      .accessibilityLabel(session.activity.isPaused ? "Resume" : "Pause")
      .accessibilityIdentifier("translate.session.toggle")
    }
  }
}
