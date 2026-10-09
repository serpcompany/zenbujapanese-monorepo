import SwiftUI
import TranslatorCore

struct ConversationControlBar: View {
  let session: LiveConversation
  let experience: TranslateExperience
  @ScaledMetric(relativeTo: .body) private var height: CGFloat = 56

  var body: some View {
    GlassEffectContainer(spacing: 12) {
      HStack(spacing: 12) {
        muteButton
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

  private var isMuted: Bool { session.isMuted }

  private var muteButton: some View {
    Button {
      session.setMuted(!isMuted)
    } label: {
      Image(systemName: isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
        .font(.title3)
        .frame(width: height, height: height)
        .contentShape(.circle)
    }
    .buttonStyle(.plain)
    .glassEffect(.regular.interactive(), in: .circle)
    .accessibilityLabel(isMuted ? "Play Translations Aloud" : "Mute Translations")
    .accessibilityIdentifier("translate.session.mute")
  }

  private var speedControl: some View {
    HStack(spacing: 0) {
      speedStep("Slower", systemImage: "minus", by: -1, identifier: "translate.session.slower")
        .disabled(experience.speechSpeed <= TranslateExperience.speechSpeeds.lowerBound)
      Text(experience.speechSpeed.formatted(.number.precision(.fractionLength(1))) + "×")
        .font(.subheadline.monospacedDigit())
        .frame(minWidth: 36)
        .accessibilityLabel("Speech speed")
        .accessibilityValue(experience.speechSpeed.formatted(.number.precision(.fractionLength(1))))
        .accessibilityIdentifier("translate.session.speed")
      speedStep("Faster", systemImage: "plus", by: 1, identifier: "translate.session.faster")
        .disabled(experience.speechSpeed >= TranslateExperience.speechSpeeds.upperBound)
    }
    .frame(height: height)
    .glassEffect(.regular.interactive(), in: .capsule)
    .foregroundStyle(isMuted ? .tertiary : .primary)
  }

  private func speedStep(
    _ title: String, systemImage: String, by steps: Int, identifier: String
  ) -> some View {
    Button {
      experience.changeSpeechSpeed(by: steps)
    } label: {
      Image(systemName: systemImage)
        .font(.body.weight(.semibold))
        .frame(width: height, height: height)
        .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(title)
    .accessibilityIdentifier(identifier)
  }

  private var timer: some View {
    HStack(spacing: 12) {
      ConversationClock(session: session)
        .accessibilityLabel("Conversation time")
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
      .accessibilityValue(session.activity.statusLine(in: session))
      .accessibilityIdentifier("translate.session.toggle")
    }
    .padding(.leading, 20)
    .padding(.trailing, 12)
    .frame(height: height)
    .glassEffect(.regular.interactive(), in: .capsule)
  }

  private var isPaused: Bool { session.activity.isPaused }
}
