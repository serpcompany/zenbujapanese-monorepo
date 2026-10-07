import SwiftUI
import TranslatorCore

struct ConversationControlBar: View {
  let session: LiveConversation
  let experience: TranslateExperience

  var body: some View {
    GlassEffectContainer(spacing: 12) {
      HStack(spacing: 12) {
        if session.mode != .listening { muteButton }
        speedControl
        Spacer(minLength: 0)
        timer
      }
    }
    .padding(.horizontal, 16)
    .padding(.top, 8)
    .padding(.bottom, 4)
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("translate.session")
  }

  private var isMuted: Bool { session.mode == .textOnly }

  private var muteButton: some View {
    Button {
      Task { await experience.switchMode(to: isMuted ? .conversation : .textOnly) }
    } label: {
      Image(systemName: isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
        .font(.title3)
        .frame(width: 48, height: 48)
    }
    .buttonStyle(.glass)
    .buttonBorderShape(.circle)
    .accessibilityLabel(isMuted ? "Play Translations Aloud" : "Mute Translations")
    .accessibilityIdentifier("translate.session.mute")
  }

  private var speedControl: some View {
    HStack(spacing: 4) {
      Button("Slower", systemImage: "minus") { experience.changeSpeechSpeed(by: -1) }
        .disabled(experience.speechSpeed <= TranslateExperience.speechSpeeds.lowerBound)
        .accessibilityIdentifier("translate.session.slower")
      Text(experience.speechSpeed.formatted(.number.precision(.fractionLength(1))) + "×")
        .font(.subheadline.monospacedDigit())
        .frame(minWidth: 36)
        .accessibilityLabel("Speech speed")
        .accessibilityValue(experience.speechSpeed.formatted(.number.precision(.fractionLength(1))))
        .accessibilityIdentifier("translate.session.speed")
      Button("Faster", systemImage: "plus") { experience.changeSpeechSpeed(by: 1) }
        .disabled(experience.speechSpeed >= TranslateExperience.speechSpeeds.upperBound)
        .accessibilityIdentifier("translate.session.faster")
    }
    .labelStyle(.iconOnly)
    .buttonStyle(.borderless)
    .font(.body.weight(.semibold))
    .padding(.horizontal, 12)
    .frame(height: 48)
    .glassEffect(.regular.interactive(), in: .capsule)
    .foregroundStyle(isMuted ? .tertiary : .primary)
  }

  private var timer: some View {
    HStack(spacing: 12) {
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
          .font(.title3)
          .foregroundStyle(isPaused ? Color.accentColor : Color.red)
          .frame(width: 32, height: 32)
          .contentShape(.rect)
      }
      .buttonStyle(.plain)
      .accessibilityLabel(isPaused ? "Resume" : "Pause")
      .accessibilityValue(session.activity.statusLine(listeningFor: session.mode))
      .accessibilityIdentifier("translate.session.toggle")
    }
    .padding(.leading, 18)
    .padding(.trailing, 10)
    .frame(height: 48)
    .glassEffect(.regular.interactive(), in: .capsule)
  }

  private var isPaused: Bool { session.activity.isPaused }
}
