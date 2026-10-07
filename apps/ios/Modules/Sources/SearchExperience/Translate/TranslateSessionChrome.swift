import SwiftUI
import Translation
import TranslatorCore

struct TranslateSessionChrome: ViewModifier {
  let experience: TranslateExperience
  let isTranslateSelected: Bool
  let isConversationOnScreen: Bool
  let returnToTranslate: () -> Void
  @Environment(\.scenePhase) private var scenePhase

  private var showsSessionBar: Bool {
    experience.session != nil && !isConversationOnScreen
  }

  func body(content: Content) -> some View {
    withAccessory(content)
      .overlay {
        if let session = experience.session, let deadline = session.silencePromptDeadline {
          StillThereCard(
            deadline: deadline,
            keepListening: { session.keepListening() },
            pause: { session.pause() }
          )
        }
      }
      .onChange(of: scenePhase) { _, phase in
        if phase == .background { experience.sceneMovedToBackground() }
      }
      .background { TranslationDownloadTask(experience: experience) }
  }

  @ViewBuilder
  private func withAccessory(_ content: Content) -> some View {
    if #available(iOS 26.1, *) {
      content.tabViewBottomAccessory(isEnabled: showsSessionBar) { accessory }
    } else {
      content.safeAreaInset(edge: .bottom) {
        if showsSessionBar {
          accessory
            .padding(.vertical, 8)
            .glassEffect(.regular, in: .capsule)
            .padding(.horizontal)
            .padding(.bottom, 60)
        }
      }
    }
  }

  @ViewBuilder
  private var accessory: some View {
    if let session = experience.session {
      TranslateSessionAccessory(
        session: session,
        isTranslateSelected: isTranslateSelected,
        returnToTranslate: returnToTranslate
      )
    }
  }
}

struct TranslateSessionAccessory: View {
  let session: LiveConversation
  let isTranslateSelected: Bool
  let returnToTranslate: () -> Void

  var body: some View {
    SessionCapsuleContent(session: session, status: status)
      .padding(.leading, 18)
      .padding(.trailing, 8)
      .contentShape(.rect)
      .onTapGesture(perform: returnToTranslate)
      .accessibilityElement(children: .contain)
      .accessibilityAction(named: "Return to Conversation", returnToTranslate)
      .accessibilityIdentifier("translate.session")
  }

  private var status: String {
    guard !isTranslateSelected else {
      return session.activity.statusLine(listeningFor: session.mode)
    }
    return session.activity.isPaused
      ? String(localized: "Conversation paused · Return")
      : String(localized: "Conversation still listening · Return")
  }
}

private struct TranslationDownloadTask: View {
  let experience: TranslateExperience

  var body: some View {
    Color.clear
      .frame(width: 0, height: 0)
      .accessibilityHidden(true)
      .translationTask(experience.translationDownload, action: download)
  }

  private nonisolated func download(_ translation: TranslationSession) async {
    try? await translation.prepareTranslation()
    await experience.translationDownloadFinished()
  }
}

private struct StillThereCard: View {
  let deadline: Date
  let keepListening: () -> Void
  let pause: () -> Void

  var body: some View {
    ZStack {
      Color.black.opacity(0.25)
        .ignoresSafeArea()
        .accessibilityHidden(true)
      TimelineView(.periodic(from: .now, by: 0.25)) { context in
        let remaining = max(0, deadline.timeIntervalSince(context.date))
        let seconds = Int(remaining.rounded(.up))
        VStack(spacing: 14) {
          Gauge(value: remaining, in: 0...10) {
            EmptyView()
          } currentValueLabel: {
            Text("\(seconds)").font(.title2.weight(.bold).monospacedDigit())
          }
          .gaugeStyle(.accessoryCircularCapacity)
          .tint(.accentColor)
          .scaleEffect(1.3)
          .padding(8)
          Text("Are you still there?")
            .font(.headline)
          Text(
            "No one has spoken for 3 minutes. The conversation pauses in \(seconds) seconds so the microphone doesn't keep listening."
          )
          .font(.subheadline)
          .foregroundStyle(.secondary)
          .multilineTextAlignment(.center)
          HStack(spacing: 12) {
            Button("Pause", action: pause)
              .buttonStyle(.glass)
              .accessibilityIdentifier("translate.still-there.pause")
            Button("Keep Listening", action: keepListening)
              .buttonStyle(.glassProminent)
              .accessibilityIdentifier("translate.still-there.keep")
          }
          .controlSize(.large)
        }
        .padding(24)
        .frame(maxWidth: 330)
        .glassEffect(.regular, in: .rect(cornerRadius: 30))
      }
    }
    .accessibilityAddTraits(.isModal)
    .accessibilityIdentifier("translate.still-there")
  }
}
