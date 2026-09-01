#if DEBUG
  import CoreText
  import SwiftUI
  import UIKit

  // PROTOTYPE for #234. This file is intentionally isolated, in-memory only,
  // and compiled out of Release builds. Remove it with the single guarded
  // launch seam in SearchExperienceRootView when the evidence question closes.
  struct PROTOTYPEIssue234TextKitRubyLinks: View {
    @State private var rows: [Row] = []
    @State private var loadFailure: String?
    @State private var activationCount = 0

    let lookupClient: LookupClient
    let exampleSentenceClient: ExampleSentenceClient
    let japaneseTextAnalysisClient: JapaneseTextAnalysisClient
    let speechSynthesisClient: SpeechSynthesisClient
    let openWord: (DictionaryEntry) -> Void

    var body: some View {
      Group {
        if let loadFailure {
          ContentUnavailableView(
            "Prototype unavailable",
            systemImage: "exclamationmark.triangle",
            description: Text(loadFailure)
          )
        } else if rows.isEmpty {
          ProgressView("Loading canonical いる evidence")
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
          ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
              ForEach(rows) { row in
                PROTOTYPEIssue234Row(
                  row: row,
                  speak: { speechSynthesisClient.speak(row.sentence.japanese) },
                  openWord: { entry in
                    activationCount += 1
                    openWord(entry)
                  }
                )
              }
            }
          }
          .accessibilityIdentifier("prototype.234.list")
        }
      }
      .navigationTitle("PROTOTYPE #234")
      .navigationBarTitleDisplayMode(.inline)
      .overlay(alignment: .topLeading) {
        Color.clear
          .frame(width: 1, height: 1)
          .accessibilityElement()
          .accessibilityLabel("Word activations \(activationCount)")
          .accessibilityIdentifier("prototype.234.activation-count")
      }
      .task { await load() }
    }

    private func load() async {
      do {
        let query = SearchQuery("いる")
        let lookup = try await lookupClient.search(query)
        guard let highlightedEntry = lookup.primaryEntry(for: query) else {
          throw LoadError.missingEntry
        }
        // The production いる journey uses the direct-Japanese retrieval route;
        // the entry is supplied separately to the current token analyzer.
        let sentences = try await exampleSentenceClient.search(query)
        guard sentences.count >= 8 else { throw LoadError.missingRows(sentences.count) }
        var loaded: [Row] = []
        for (index, sentence) in sentences.prefix(8).enumerated() {
          let tokens = await japaneseTextAnalysisClient.linkedTokens(
            sentence.japanese,
            query,
            highlightedEntry
          )
          loaded.append(Row(index: index, sentence: sentence, tokens: tokens))
        }
        rows = loaded
      } catch {
        loadFailure = String(describing: error)
      }
    }

    struct Row: Identifiable {
      var id: ExampleSentenceID { sentence.id }
      let index: Int
      let sentence: ExampleSentence
      let tokens: [JapaneseTextToken]
    }

    private enum LoadError: Error {
      case missingEntry
      case missingRows(Int)
    }
  }

  private struct PROTOTYPEIssue234Row: View {
    let row: PROTOTYPEIssue234TextKitRubyLinks.Row
    let speak: () -> Void
    let openWord: (DictionaryEntry) -> Void

    var body: some View {
      VStack(alignment: .leading, spacing: 8) {
        PROTOTYPEIssue234TextView(
          rowIndex: row.index,
          tokens: row.tokens,
          openWord: openWord
        )
        .accessibilityIdentifier("prototype.234.textkit.\(row.index)")

        Button(action: speak) {
          Label("Speak example \(row.index + 1)", systemImage: "speaker.wave.2")
        }
        .accessibilityIdentifier("prototype.234.speaker.\(row.index)")

        Text(row.sentence.english)
          .font(.body)
          .foregroundStyle(.secondary)
          .accessibilityIdentifier("prototype.234.english.\(row.index)")

        if row.index == 2 {
          VStack(alignment: .leading, spacing: 4) {
            Text("SwiftUI Text(AttributedString) negative control")
              .font(.caption)
              .foregroundStyle(.secondary)
            Text(controlAttributedString)
              .font(.title3)
              .environment(
                \.openURL,
                OpenURLAction { url in
                  guard let entry = entry(for: url) else { return .discarded }
                  openWord(entry)
                  return .handled
                }
              )
              .accessibilityIdentifier("prototype.234.swiftui-control")
          }
        }
      }
      .padding(.horizontal, 18)
      .padding(.vertical, 14)
      .frame(maxWidth: .infinity, alignment: .leading)
      .overlay(alignment: .bottom) { Divider() }
      .accessibilityElement(children: .contain)
      .accessibilityIdentifier("prototype.234.row.\(row.index)")
    }

    private var controlAttributedString: AttributedString {
      var result = AttributedString()
      for token in row.tokens {
        var segment = AttributedString(token.surface)
        if token.entry != nil {
          segment.link = linkURL(for: token)
          segment.underlineStyle = .single
        }
        result.append(segment)
      }
      return result
    }

    private func entry(for url: URL) -> DictionaryEntry? {
      guard let id = PROTOTYPEIssue234Link.tokenID(from: url) else { return nil }
      return row.tokens.first { $0.id == id }?.entry
    }

    private func linkURL(for token: JapaneseTextToken) -> URL {
      PROTOTYPEIssue234Link.url(tokenID: token.id, rowIndex: row.index)
    }
  }

  private struct PROTOTYPEIssue234TextView: UIViewRepresentable {
    let rowIndex: Int
    let tokens: [JapaneseTextToken]
    let openWord: (DictionaryEntry) -> Void

    func makeCoordinator() -> Coordinator {
      Coordinator(openWord: openWord)
    }

    func makeUIView(context: Context) -> UITextView {
      let view = UITextView(usingTextLayoutManager: true)
      view.delegate = context.coordinator
      view.isEditable = false
      view.isSelectable = true
      view.isScrollEnabled = false
      view.backgroundColor = .clear
      view.adjustsFontForContentSizeCategory = true
      view.textContainerInset = .zero
      view.textContainer.lineFragmentPadding = 0
      view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
      view.linkTextAttributes = [
        .foregroundColor: UIColor.tintColor,
        .underlineStyle: NSUnderlineStyle.single.rawValue,
      ]
      return view
    }

    func updateUIView(_ view: UITextView, context: Context) {
      context.coordinator.openWord = openWord
      let built = attributedText()
      context.coordinator.entriesByURL = built.entriesByURL
      if view.attributedText != built.value {
        view.attributedText = built.value
      }
      view.accessibilityIdentifier = "prototype.234.textkit.\(rowIndex)"
      view.invalidateIntrinsicContentSize()
    }

    func sizeThatFits(
      _ proposal: ProposedViewSize,
      uiView: UITextView,
      context: Context
    ) -> CGSize? {
      guard let width = proposal.width else { return nil }
      let measured = uiView.sizeThatFits(
        CGSize(width: width, height: .greatestFiniteMagnitude)
      )
      return CGSize(width: width, height: ceil(measured.height))
    }

    private func attributedText() -> (
      value: NSAttributedString, entriesByURL: [URL: DictionaryEntry]
    ) {
      let result = NSMutableAttributedString()
      var entriesByURL: [URL: DictionaryEntry] = [:]
      let baseFont = UIFont.preferredFont(forTextStyle: .title3)
      let rubyKey = NSAttributedString.Key(kCTRubyAnnotationAttributeName as String)

      for token in tokens {
        let start = result.length
        result.append(
          NSAttributedString(
            string: token.surface,
            attributes: [
              .font: baseFont,
              .foregroundColor: UIColor.label,
            ]
          )
        )
        let tokenRange = NSRange(location: start, length: result.length - start)
        guard let entry = token.entry else { continue }

        let url = PROTOTYPEIssue234Link.url(tokenID: token.id, rowIndex: rowIndex)
        entriesByURL[url] = entry
        result.addAttribute(.link, value: url, range: tokenRange)
        result.addAttribute(
          .accessibilityTextCustom,
          value: [entry.reading, entry.summary],
          range: tokenRange
        )

        var segmentLocation = start
        for segment in JapaneseRubyAnnotation.segments(
          surface: token.surface,
          reading: entry.reading
        ) {
          let length = (segment.base as NSString).length
          if let reading = segment.reading {
            let ruby = CTRubyAnnotationCreateWithAttributes(
              .auto,
              .auto,
              .before,
              reading as CFString,
              [kCTRubyAnnotationSizeFactorAttributeName: 0.5] as CFDictionary
            )
            result.addAttribute(
              rubyKey,
              value: ruby,
              range: NSRange(location: segmentLocation, length: length)
            )
          }
          segmentLocation += length
        }
      }
      return (result, entriesByURL)
    }

    @MainActor
    final class Coordinator: NSObject, UITextViewDelegate {
      var openWord: (DictionaryEntry) -> Void
      var entriesByURL: [URL: DictionaryEntry] = [:]

      init(openWord: @escaping (DictionaryEntry) -> Void) {
        self.openWord = openWord
      }

      func textView(
        _ textView: UITextView,
        primaryActionFor textItem: UITextItem,
        defaultAction: UIAction
      ) -> UIAction? {
        guard case .link(let url) = textItem.content,
          let entry = entriesByURL[url]
        else { return nil }
        return UIAction { [weak self] _ in
          self?.openWord(entry)
        }
      }
    }
  }

  private enum PROTOTYPEIssue234Link {
    static func url(tokenID: Int, rowIndex: Int) -> URL {
      URL(string: "zenbu-prototype-234://word/\(tokenID)?row=\(rowIndex)")!
    }

    static func tokenID(from url: URL) -> Int? {
      Int(url.lastPathComponent)
    }
  }
#endif
