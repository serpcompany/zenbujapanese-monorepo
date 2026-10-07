import SwiftUI
import TranslatorCore

struct SessionCapsuleContent: View {
  let session: LiveConversation
  let status: String?

  var body: some View {
    HStack(spacing: 12) {
      VStack(alignment: .leading, spacing: 1) {
        TimelineView(.periodic(from: .now, by: 1)) { context in
          Text(
            Duration.seconds(session.elapsed(at: context.date))
              .formatted(.time(pattern: .minuteSecond))
          )
          .font(.headline.monospacedDigit())
          .foregroundStyle(session.activity.isPaused ? Color.secondary : Color.red)
        }
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

struct ConversationTimerControl: View {
  let session: LiveConversation

  var body: some View {
    HStack(spacing: 6) {
      TimelineView(.periodic(from: .now, by: 1)) { context in
        Text(
          Duration.seconds(session.elapsed(at: context.date))
            .formatted(.time(pattern: .minuteSecond))
        )
        .font(.headline.monospacedDigit())
        .foregroundStyle(isPaused ? Color.secondary : Color.red)
        .accessibilityLabel("Conversation time")
      }
      Button {
        if isPaused { session.start() } else { session.pause() }
      } label: {
        Image(systemName: isPaused ? "play.fill" : "pause.fill")
          .foregroundStyle(isPaused ? Color.accentColor : Color.red)
          .frame(width: 28, height: 28)
          .contentShape(.rect)
      }
      .buttonStyle(.plain)
      .accessibilityLabel(isPaused ? "Resume" : "Pause")
      .accessibilityValue(session.activity.statusLine(listeningFor: session.mode))
      .accessibilityIdentifier("translate.session.toggle")
    }
    .padding(.leading, 10)
    .padding(.trailing, 4)
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("translate.session")
  }

  private var isPaused: Bool { session.activity.isPaused }
}
