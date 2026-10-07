import SwiftUI
import TranslatorCore
import UIKit

struct TranslateHomeView: View {
  @Bindable var experience: TranslateExperience
  let words: TranslateWordLinks
  let openHistory: () -> Void
  @State private var typedText = ""
  @State private var isChoosingMode = false

  var body: some View {
    VStack(spacing: 12) {
      if let problem = experience.startProblem {
        StartProblemBanner(problem: problem, experience: experience)
      }
      TypedTranslationCard(
        text: $typedText,
        experience: experience,
        words: words,
        openLiveModes: { isChoosingMode = true }
      )
    }
    .padding(.horizontal)
    .padding(.bottom, 12)
    .background(Color(uiColor: .systemBackground))
    .navigationTitle("Translate")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Button("History", systemImage: "clock.arrow.circlepath", action: openHistory)
          .accessibilityIdentifier("translate.history")
      }
    }
    .sheet(isPresented: $isChoosingMode) {
      LiveModesSheet(selection: experience.preferredMode, confirmTitle: String(localized: "Start")) {
        mode in
        experience.preferredMode = mode
        Task { await experience.start(mode) }
      }
    }
  }
}

private struct StartProblemBanner: View {
  let problem: TranslateStartProblem
  let experience: TranslateExperience
  @Environment(\.openURL) private var openURL

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      Image(
        systemName: problem == .microphoneDenied
          ? "mic.slash.fill" : "exclamationmark.triangle.fill"
      )
      .foregroundStyle(.red)
      .font(.title3)
      VStack(alignment: .leading, spacing: 4) {
        Text(title).font(.headline)
        Text(message).font(.subheadline).foregroundStyle(.secondary)
        actions
      }
      Spacer(minLength: 0)
      Button("Dismiss", systemImage: "xmark") { experience.dismissStartProblem() }
        .labelStyle(.iconOnly)
        .buttonStyle(.plain)
        .foregroundStyle(.secondary)
    }
    .padding(16)
    .background(Color(uiColor: .secondarySystemBackground), in: .rect(cornerRadius: 24))
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("translate.start-problem")
  }

  @ViewBuilder
  private var actions: some View {
    switch problem {
    case .microphoneDenied:
      Button("Open Settings") {
        if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
      }
      .font(.subheadline.weight(.semibold))
    case .translationUnavailable:
      Button("Download Japanese") { experience.requestTranslationDownload() }
        .font(.subheadline.weight(.semibold))
    case .speechUnavailable:
      EmptyView()
    }
  }

  private var title: String {
    switch problem {
    case .microphoneDenied: String(localized: "Microphone access is off")
    case .speechUnavailable: String(localized: "Speech recognition isn't ready")
    case .translationUnavailable: String(localized: "Translation isn't downloaded")
    }
  }

  private var message: String {
    switch problem {
    case .microphoneDenied: TranslatorFailure.microphoneDenied.message
    case .speechUnavailable:
      String(
        localized:
          "Japanese and English speech recognition need a one-time download over the internet. Try again when you're online."
      )
    case .translationUnavailable:
      String(localized: "Translate runs on this iPhone with Apple's Japanese and English languages.")
    }
  }
}
