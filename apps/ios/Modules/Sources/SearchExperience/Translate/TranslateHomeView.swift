import SwiftUI
import TranslatorCore

struct TranslateHomeView: View {
  @Bindable var experience: TranslateExperience
  let openHistory: () -> Void
  let openText: (String) -> Void
  @State private var isChoosingDocument = false
  @State private var isReadingDocument = false
  @State private var unreadableDocument = false

  var body: some View {
    ScrollView {
      VStack(spacing: 16) {
        TranslateStartPicker(selection: $experience.preferredStart)
      }
      .padding(.horizontal)
      .padding(.bottom, 24)
    }
    .safeAreaInset(edge: .bottom) { startButton }
    .background(SystemColor.background)
    .navigationTitle("Translate")
    .inlineNavigationTitle()
    .toolbar {
      ToolbarItem(placement: .barTrailing) {
        Button("Translations", systemImage: "clock.arrow.circlepath", action: openHistory)
          .accessibilityIdentifier("translate.history")
      }
    }
    .fileImporter(isPresented: $isChoosingDocument, allowedContentTypes: DocumentText.readableTypes) {
      result in
      guard case .success(let url) = result else { return }
      Task { await read(url) }
    }
    .modifier(StartProblemAlert(experience: experience))
    .alert("Couldn't read this document", isPresented: $unreadableDocument) {
      Button("OK", role: .cancel) {}
    } message: {
      Text("Choose a PDF, a photo, or a text file with Japanese or English text in it.")
    }
  }

  private var isBusy: Bool { experience.isPreparing || isReadingDocument }

  private func start() {
    switch experience.preferredStart {
    case .conversation, .listening:
      Task { await experience.start() }
    case .text:
      openText("")
    case .document:
      isChoosingDocument = true
    }
  }

  private func read(_ url: URL) async {
    isReadingDocument = true
    defer { isReadingDocument = false }
    do {
      openText(try await DocumentText.read(url))
    } catch {
      unreadableDocument = true
    }
  }

  private var startButton: some View {
    VStack(spacing: 8) {
      if let preparation = experience.preparation {
        Text(preparation.label)
          .font(.subheadline)
          .foregroundStyle(.secondary)
          .accessibilityIdentifier("translate.preparing")
      }
      Button(action: start) {
        Group {
          if isBusy {
            ProgressView()
          } else {
            Text("Start")
          }
        }
        .font(.headline)
        .padding(.horizontal, 28)
      }
      .buttonStyle(.borderedProminent)
      .buttonBorderShape(.capsule)
      .controlSize(.large)
      .disabled(isBusy)
      .accessibilityIdentifier("translate.start")
    }
    .padding(.bottom, 8)
  }
}

struct TypedTranslationScreen: View {
  let experience: TranslateExperience
  let words: TranslateWordLinks
  @State private var text: String

  init(text: String, experience: TranslateExperience, words: TranslateWordLinks) {
    _text = State(initialValue: text)
    self.experience = experience
    self.words = words
  }

  var body: some View {
    TypedTranslationCard(text: $text, experience: experience, words: words)
      .environment(experience.readingAids)
      .padding(.horizontal)
      .padding(.bottom, 12)
      .background(SystemColor.background)
      .navigationTitle("Text")
      .inlineNavigationTitle()
      .toolbar {
        ToolbarItem(placement: .barTrailing) {
          Menu("Options", systemImage: "ellipsis") {
            FuriganaToggle(readingAids: experience.readingAids)
          }
          .accessibilityIdentifier("translate.text.options")
        }
      }
  }
}

private struct StartProblemAlert: ViewModifier {
  let experience: TranslateExperience
  @Environment(\.openURL) private var openURL

  func body(content: Content) -> some View {
    content.alert(
      title, isPresented: isPresented, presenting: experience.startProblem
    ) { problem in
      switch problem {
      case .microphoneDenied:
        Button("Open Settings") {
          if let url = SystemSettings.url(for: .microphone) { openURL(url) }
        }
        Button("Cancel", role: .cancel) {}
      case .translationUnavailable:
        Button("Download Japanese") { experience.requestTranslationDownload() }
        Button("Cancel", role: .cancel) {}
      case .speechUnavailable:
        Button("OK", role: .cancel) {}
      }
    } message: { _ in
      Text(message)
    }
  }

  private var isPresented: Binding<Bool> {
    Binding(
      get: { experience.startProblem != nil },
      set: { if !$0 { experience.dismissStartProblem() } })
  }

  private var title: String {
    guard let problem = experience.startProblem else { return "" }
    return switch problem {
    case .microphoneDenied: String(localized: "Allow the microphone")
    case .speechUnavailable: String(localized: "Speech recognition isn't ready")
    case .translationUnavailable: String(localized: "Translation isn't downloaded")
    }
  }

  private var message: String {
    guard let problem = experience.startProblem else { return "" }
    return switch problem {
    case .microphoneDenied: TranslatorFailure.microphoneDenied.message
    case .speechUnavailable:
      String(
        localized:
          "Japanese and English speech recognition need a one-time download over the internet. Try again when you're online."
      )
    case .translationUnavailable:
      String(localized: "Translate runs on this \(ThisDevice.name) with Apple's Japanese and English languages.")
    }
  }
}
