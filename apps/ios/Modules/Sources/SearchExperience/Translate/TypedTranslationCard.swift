import SwiftUI
import TranslatorCore

struct TypedTranslationCard: View {
  private struct Result: Equatable {
    let source: SpokenLanguage
    let translation: String
  }

  private enum Status: Equatable {
    case idle
    case translating
    case translated(Result)
    case needsDownload
    case failed
  }

  private static let typingPause: Duration = .milliseconds(450)

  @Binding var text: String
  let experience: TranslateExperience
  let words: TranslateWordLinks
  @State private var status = Status.idle
  @State private var copyCount = 0
  @FocusState private var isEditing: Bool

  var body: some View {
    VStack(spacing: 0) {
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          TextField("Translate anything", text: $text, axis: .vertical)
            .font(.title)
            .focused($isEditing)
            .accessibilityIdentifier("translate.typed.input")
          statusContent
        }
        .padding(.horizontal, 22)
        .padding(.top, 22)
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .contentShape(.rect)
      .onTapGesture { isEditing = true }
      .scrollDismissesKeyboard(.interactively)
      bottomBar
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(SystemColor.secondaryBackground, in: .rect(cornerRadius: 32))
    .task(id: request) { await translate(request.text) }
    .onAppear { if text.isEmpty { isEditing = true } }
    .sensoryFeedback(.success, trigger: copyCount)
  }

  private var bottomBar: some View {
    HStack(spacing: 12) {
      if !text.isEmpty {
        Button("Clear", systemImage: "xmark") {
          text = ""
          isEditing = true
        }
        .labelStyle(.iconOnly)
        .font(.title3)
        .foregroundStyle(.secondary)
        .accessibilityIdentifier("translate.typed.clear")
      }
      Spacer()
    }
    .padding(16)
  }

  private var request: TypedRequest {
    TypedRequest(
      text: text.trimmingCharacters(in: .whitespacesAndNewlines),
      isDownloading: experience.translationDownload != nil)
  }

  @ViewBuilder
  private var statusContent: some View {
    switch status {
    case .idle:
      EmptyView()
    case .translating:
      Divider()
      Text("Translating…")
        .font(.title3)
        .foregroundStyle(.tertiary)
    case .translated(let result):
      Divider()
      HStack(spacing: 16) {
        Text(result.source.translationDirection)
          .font(.subheadline)
          .foregroundStyle(.secondary)
          .accessibilityIdentifier("translate.typed.direction")
        Spacer()
        Button("Copy", systemImage: "doc.on.doc") {
          Pasteboard.copy(result.translation)
          copyCount += 1
        }
        Button("Speak", systemImage: "speaker.wave.2") {
          Task {
            await experience.services.clients.playback.speak(
              result.translation, result.source.counterpart)
          }
        }
      }
      .labelStyle(.iconOnly)
      .buttonStyle(.borderless)
      TranslateLinkedText(
        text: result.translation, language: result.source.counterpart,
        identifier: "translate.typed.result",
        words: TranslateWordLinks(analysisClient: words.analysisClient) { request in
          isEditing = false
          words.open(request)
        })
    case .needsDownload:
      Divider()
      VStack(alignment: .leading, spacing: 6) {
        Text("Translation runs on this \(ThisDevice.name) once Apple's Japanese language is downloaded.")
          .foregroundStyle(.secondary)
        Button("Download Japanese") { experience.requestTranslationDownload() }
      }
    case .failed:
      Divider()
      Text("Couldn't translate this. Try again.")
        .foregroundStyle(.secondary)
    }
  }

  private func translate(_ source: String) async {
    guard let language = SpokenLanguage.detect(in: source) else {
      status = .idle
      return
    }
    do {
      try await Task.sleep(for: Self.typingPause)
    } catch {
      return
    }
    status = .translating
    do {
      let translation = try await experience.services.clients.translation.translate(
        source, language, []
      ).trimmingCharacters(in: .whitespacesAndNewlines)
      try Task.checkCancellation()
      guard !translation.isEmpty else { throw TranslatorFailure.translationUnavailable }
      status = .translated(Result(source: language, translation: translation))
    } catch is CancellationError {
      return
    } catch {
      guard !Task.isCancelled else { return }
      status =
        await experience.services.translationAvailability() == .downloadable
        ? .needsDownload : .failed
    }
  }
}

private struct TypedRequest: Equatable {
  let text: String
  let isDownloading: Bool
}

extension TranslatePreparation {
  var label: String {
    switch self {
    case .checking: String(localized: "Getting ready…")
    case .downloadingTranslation: String(localized: "Downloading translation…")
    case .downloadingSpeech(let fraction):
      String(
        localized:
          "Downloading speech \(fraction.formatted(.percent.precision(.fractionLength(0))))")
    }
  }
}
