import SwiftUI
import TranslatorCore
import UIKit

struct TranslateHomeView: View {
  @Bindable var experience: TranslateExperience
  let openHistory: () -> Void
  let openText: (String) -> Void
  let cameraAuthorizationClient: CameraAuthorizationClient
  let openImageText: ([ImageTextAsset]) -> Void
  @State private var requestedImageSource: ImageTextSource?
  @State private var choosesPhotoSource = false
  @State private var chosenPhotoSource: ImageTextSource?
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
    .listSectionSpacing(.compact)
    .contentMargins(.top, 4, for: .scrollContent)
    .disabled(isBusy)
    .navigationTitle("Translate")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
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
    .modifier(
      ImageTextImport(
        requestedSource: $requestedImageSource,
        cameraAuthorizationClient: cameraAuthorizationClient,
        openImageText: openImageText
      )
    )
    .alert("Image", isPresented: $choosesPhotoSource) {
      Button("Take Photo") { chosenPhotoSource = .camera }
        .accessibilityIdentifier("translate.image.take-photo")
      Button("Photo Library") { chosenPhotoSource = .photoLibrary }
        .accessibilityIdentifier("translate.image.photo-library")
      Button("Cancel", role: .cancel) {}
    } message: {
      Text("Then tap any word to look it up.")
    }
    .onChange(of: choosesPhotoSource) { _, shown in
      guard !shown, let source = chosenPhotoSource else { return }
      chosenPhotoSource = nil
      requestedImageSource = source
    }
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
      }
    }
    .contentShape(.rect)
  }

  private func start(_ option: TranslateStart) {
    startingMode = option
    if let mode = option.liveMode {
      Task { await experience.start(mode) }
      return
    }
    switch option {
    case .text: openText("")
    case .document: isChoosingDocument = true
    case .image: choosesPhotoSource = true
    case .conversation, .listening: break
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
      Text("Japanese and English, on your iPhone.")
        .foregroundStyle(.secondary)
        .lineLimit(1)
    }
    .padding(.vertical, 2)
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
      .background(Color(uiColor: .systemBackground))
      .navigationTitle("Text")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
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
          if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
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
      String(localized: "Translate runs on this iPhone with Apple's Japanese and English languages.")
    }
  }
}
