import SwiftUI
import TranslatorCore

struct TranslateHomeView: View {
  @Bindable var experience: TranslateExperience
  let openHistory: () -> Void
  let openText: (String) -> Void
  @Binding var showsImageSources: Bool
  @State private var startingMode: TranslateStart?
  @State private var isChoosingDocument = false
  @State private var isReadingDocument = false
  @State private var unreadableDocument = false

  var body: some View {
    List {
      Section {
        TranslateHomeHeader()
      }
      Section {
        ForEach(TranslateStart.spokenRows) { option in row(option) }
      } header: {
        Text("Spoken")
      } footer: {
        if let preparation = experience.preparation {
          Text(preparation.label)
            .accessibilityIdentifier("translate.preparing")
        }
      }
      Section("Written") {
        ForEach(TranslateStart.writtenRows) { option in row(option) }
      }
    }
    .compactSectionSpacing()
    .contentMargins(.top, 4, for: .scrollContent)
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
      Text("Choose a PDF or a text file with Japanese or English text in it.")
    }
  }

  private var isBusy: Bool { experience.isPreparing || isReadingDocument }

  private func row(_ option: TranslateStart) -> some View {
    Button {
      start(option)
    } label: {
      rowLabel(option)
    }
    .tint(.primary)
    .disabled(isBusy)
    .accessibilityIdentifier("translate.start.\(option.rawValue)")
  }

  private func rowLabel(_ option: TranslateStart) -> some View {
    HStack {
      SettingsRowLabel(
        LocalizedStringKey(option.title), systemImage: option.systemImage, tint: option.tint)
      Spacer()
      if isBusy, startingMode == option {
        ProgressView()
      } else {
        Image(systemName: "chevron.forward")
          .font(.footnote.weight(.semibold))
          .foregroundStyle(.tertiary)
          .accessibilityHidden(true)
      }
    }
    .contentShape(.rect)
  }

  private func start(_ option: TranslateStart) {
    startingMode = option
    switch option {
    case .conversation: Task { await experience.start(.conversation) }
    case .listening: Task { await experience.start(.listening) }
    case .image: showsImageSources = true
    case .text: openText("")
    case .document: isChoosingDocument = true
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
}

private struct TranslateHomeHeader: View {
  @ScaledMetric(relativeTo: .largeTitle) private var tileSize = 48

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Image(systemName: "translate")
        .font(.system(size: tileSize * 0.5, weight: .semibold))
        .foregroundStyle(.white)
        .frame(width: tileSize, height: tileSize)
        .background(Color.blue.gradient, in: .rect(cornerRadius: tileSize * 0.23))
        .accessibilityHidden(true)
      Text("Translate")
        .font(.title2.bold())
      Text("Japanese and English, on your \(ThisDevice.name).")
        .foregroundStyle(.secondary)
        .lineLimit(1)
    }
    .padding(.vertical, 2)
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(.isHeader)
    .accessibilityIdentifier("translate.header")
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
