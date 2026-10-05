import SwiftUI

struct LinkedJapaneseText: View {
  @Environment(ReadingAidPreferences.self) private var readingAidPreferences
  private struct AnalysisIdentity: Hashable {
    let text: String
    let highlightedQuery: SearchQuery
    let highlightedEntryID: LanguageReferenceID?
  }

  enum Presentation {
    case standard
    case compactNaturalFlow

    var usesDedicatedWordSelector: Bool { self == .compactNaturalFlow }
    var usesMinimumHitRegionHeight: Bool { !usesDedicatedWordSelector }
  }

  @ScaledMetric(relativeTo: .body) private var lineSpacing: CGFloat = 3
  @State private var tokens: [JapaneseTextToken] = []
  @State private var didFinishAnalysis = false

  let text: String
  let highlightedQuery: SearchQuery
  let highlightedEntry: DictionaryEntry?
  let japaneseTextAnalysisClient: JapaneseTextAnalysisClient
  let identifierPrefix: String
  let presentation: Presentation
  let japaneseIdentifier: String?
  let highlightsCurrentEntry: Bool
  let highlightsQuery: Bool
  let tokensChanged: ([JapaneseTextToken]) -> Void
  let openWord: (DictionaryEntry) -> Void
  let openCandidates: ((_ surface: String, _ candidates: [DictionaryEntry]) -> Void)?

  init(
    text: String,
    highlightedQuery: SearchQuery,
    highlightedEntry: DictionaryEntry?,
    japaneseTextAnalysisClient: JapaneseTextAnalysisClient,
    identifierPrefix: String,
    presentation: Presentation = .standard,
    japaneseIdentifier: String? = nil,
    highlightsCurrentEntry: Bool = false,
    highlightsQuery: Bool = false,
    tokensChanged: @escaping ([JapaneseTextToken]) -> Void = { _ in },
    openCandidates: ((_ surface: String, _ candidates: [DictionaryEntry]) -> Void)? = nil,
    openWord: @escaping (DictionaryEntry) -> Void
  ) {
    self.text = text
    self.highlightedQuery = highlightedQuery
    self.highlightedEntry = highlightedEntry
    self.japaneseTextAnalysisClient = japaneseTextAnalysisClient
    self.identifierPrefix = identifierPrefix
    self.presentation = presentation
    self.japaneseIdentifier = japaneseIdentifier
    self.highlightsCurrentEntry = highlightsCurrentEntry
    self.highlightsQuery = highlightsQuery
    self.tokensChanged = tokensChanged
    self.openWord = openWord
    self.openCandidates = openCandidates
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      if presentation.usesDedicatedWordSelector,
        let japaneseIdentifier
      {
        VStack(alignment: .leading, spacing: 0) {
          japaneseContent
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(text)
        .accessibilityIdentifier(japaneseIdentifier)
      } else {
        japaneseContent
      }
      if readingAidPreferences.showsRomaji, didFinishAnalysis {
        if let romaji = AppleJapaneseRomanization.romanizeCompleteSentence(tokens) {
          Text(romaji)
            .font(.callout)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityLabel("Romaji, \(romaji)")
            .accessibilityIdentifier("\(identifierPrefix).romaji")
        } else if !text.isEmpty {
          Text("Romaji unavailable for this text")
            .font(.caption)
            .foregroundStyle(.secondary)
            .accessibilityIdentifier("\(identifierPrefix).romaji-unavailable")
        }
      }
    }
    .accessibilityElement(children: .contain)
    .task(id: analysisIdentity) {
      didFinishAnalysis = false
      let resolvedTokens = await japaneseTextAnalysisClient.linkedTokens(
        text,
        highlightedQuery,
        highlightedEntry
      )
      tokens = resolvedTokens
      tokensChanged(resolvedTokens)
      didFinishAnalysis = true
    }
  }

  @ViewBuilder
  private var japaneseContent: some View {
    Group {
      if tokens.isEmpty {
        Text(text)
          .font(.title3)
      } else {
        let queryRanges = highlightsQuery ? queryScalarRanges : []
        LinkedTokenLayout(
          itemSpacing: 0,
          lineSpacing: readingAidPreferences.showsWordMeanings ? lineSpacing * 3 : lineSpacing
        ) {
          ForEach(tokens) { token in
            LinkedTokenView(
              token: token,
              identifier: "\(identifierPrefix).\(token.id).\(token.surface)",
              presentation: presentation,
              isCurrentEntry: isCurrentEntry(token),
              matchesQuery: Self.matchesQuery(token, queryRanges: queryRanges),
              openWord: openWord,
              openCandidates: openCandidates
            )
            .layoutValue(
              key: JapaneseTokenLineBreakBehaviorKey.self,
              value: token.surface.japaneseTokenLineBreakBehavior
            )
            .layoutValue(
              key: JapaneseTokenAllowsInternalWrappingKey.self,
              value: token.entry == nil && token.candidateEntries.isEmpty
            )
          }
        }
      }
    }
  }

  private var queryScalarRanges: [Range<Int>] {
    ExampleSentencesScreen.queryScalarRanges(in: text, query: highlightedQuery.value)
  }

  nonisolated static func matchesQuery(
    _ token: JapaneseTextToken, queryRanges: [Range<Int>]
  ) -> Bool {
    queryRanges.contains { $0.overlaps(token.scalarRange) }
  }

  private func isCurrentEntry(_ token: JapaneseTextToken) -> Bool {
    guard highlightsCurrentEntry, let highlightedEntry else { return false }
    return token.represents(highlightedEntry)
  }

  private var analysisIdentity: AnalysisIdentity {
    AnalysisIdentity(
      text: text,
      highlightedQuery: highlightedQuery,
      highlightedEntryID: highlightedEntry?.id
    )
  }
}

private struct LinkedTokenView: View {
  @Environment(ReadingAidPreferences.self) private var readingAidPreferences
  @Environment(WordKnowledge.self) private var wordKnowledge
  let token: JapaneseTextToken
  let identifier: String
  let presentation: LinkedJapaneseText.Presentation
  let isCurrentEntry: Bool
  let matchesQuery: Bool
  let openWord: (DictionaryEntry) -> Void
  let openCandidates: ((_ surface: String, _ candidates: [DictionaryEntry]) -> Void)?

  private var isHighlighted: Bool { isCurrentEntry || matchesQuery }

  private func displayReading(for entry: DictionaryEntry) -> String {
    let forms = [entry.headword] + entry.writtenForms.map(\.value) + entry.readingForms.map(\.value)
    guard !forms.contains(token.surface), let reading = token.reading, !reading.isEmpty else {
      return entry.reading
    }
    return reading.applyingTransform(.hiraganaToKatakana, reverse: true) ?? reading
  }

  private func meaning(for entry: DictionaryEntry) -> String? {
    guard readingAidPreferences.showsWordMeanings,
      !token.isFunctionWord,
      !wordKnowledge.isKnown(entry.id)
    else { return nil }
    return entry.shortMeaning
  }

  private func hidesFurigana(for entry: DictionaryEntry) -> Bool {
    readingAidPreferences.hidesFuriganaOnKnownWords && !isHighlighted
      && wordKnowledge.isKnown(entry.id)
  }

  var body: some View {
    if let entry = token.entry {
      if presentation.usesDedicatedWordSelector {
        JapaneseRubyText(
          surface: token.surface,
          reading: displayReading(for: entry),
          exposesAccessibility: false,
          displaysRomaji: false,
          hidesFurigana: hidesFurigana(for: entry),
          highlightsKanjiOnTap: false
        )
        .foregroundStyle(isHighlighted ? Color.accentColor : Color.primary)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(token.surface)
        .accessibilityIdentifier(identifier)
      } else {
        Button {
          openWord(entry)
        } label: {
          JapaneseRubyText(
            surface: token.surface,
            reading: displayReading(for: entry),
            exposesAccessibility: false,
            displaysRomaji: false,
            hidesFurigana: hidesFurigana(for: entry),
            highlightsKanjiOnTap: false
          )
          .foregroundStyle(isHighlighted ? Color.accentColor : Color.primary)
          .wordUnderline(
            isHighlighted: isHighlighted,
            isVisible: isHighlighted || !wordKnowledge.isKnown(entry.id)
          )
          .modifier(WordMeaning(meaning: meaning(for: entry)))
        }
        .buttonStyle(.plain)
        .frame(
          minHeight: presentation.usesMinimumHitRegionHeight ? 44 : nil,
          alignment: .bottom
        )
        .contentShape(Rectangle())
        .accessibilityLabel("\(token.surface), \(entry.reading), \(entry.summary)")
        .accessibilityValue(isCurrentEntry ? "Current word" : "")
        .accessibilityAddTraits(isCurrentEntry ? .isSelected : [])
        .accessibilityIdentifier(identifier)
      }
    } else if !token.candidateEntries.isEmpty {
      if presentation.usesDedicatedWordSelector {
        Text(token.surface)
          .font(.body)
          .accessibilityIdentifier(identifier)
      } else if let openCandidates {
        Button {
          openCandidates(token.surface, token.candidateEntries)
        } label: {
          Text(token.surface)
            .font(.body)
            .foregroundStyle(isHighlighted ? Color.accentColor : Color.primary)
            .wordUnderline(isHighlighted: isHighlighted)
            .frame(
              minHeight: presentation.usesMinimumHitRegionHeight ? 44 : nil,
              alignment: .bottom
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(token.surface), choose dictionary entry")
        .accessibilityHint("Shows \(token.candidateEntries.count) possible dictionary entries")
        .accessibilityIdentifier(identifier)
      } else {
        Menu {
          ForEach(token.candidateEntries) { candidate in
            Button {
              openWord(candidate)
            } label: {
              Text("\(candidate.headword) (\(candidate.reading)) — \(candidate.summary)")
            }
          }
        } label: {
          Text(token.surface)
            .font(.body)
            .foregroundStyle(isHighlighted ? Color.accentColor : Color.primary)
            .wordUnderline(isHighlighted: isHighlighted)
            .frame(
              minHeight: presentation.usesMinimumHitRegionHeight ? 44 : nil,
              alignment: .bottom
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .contentShape(Rectangle())
        .accessibilityLabel("\(token.surface), choose dictionary entry")
        .accessibilityHint("Shows \(token.candidateEntries.count) possible dictionary entries")
        .accessibilityIdentifier(identifier)
      }
    } else {
      Text(token.surface)
        .font(.body)
        .accessibilityIdentifier(identifier)
    }
  }
}

private struct WordMeaning: ViewModifier {
  let meaning: String?
  @ScaledMetric(relativeTo: .caption) private var maximumMeaningWidth: CGFloat = 96
  @State private var wordWidth: CGFloat = 0
  @State private var meaningSize = CGSize.zero

  func body(content: Content) -> some View {
    if let meaning {
      let meaningWidth = min(meaningSize.width, maximumMeaningWidth)
      content
        .fixedSize()
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { wordWidth = $0 }
        .padding(.bottom, meaningSize.height)
        .frame(width: max(wordWidth, meaningWidth))
        .overlay(alignment: .bottom) {
          Text(meaning)
            .font(.caption)
            .foregroundStyle(.tint)
            .lineLimit(1)
            .frame(width: meaningWidth)
        }
        .background {
          Text(meaning)
            .font(.caption)
            .fixedSize()
            .hidden()
            .onGeometryChange(for: CGSize.self) { $0.size } action: { meaningSize = $0 }
        }
        .padding(.horizontal, 3)
    } else {
      content
    }
  }
}

extension View {
  fileprivate func wordUnderline(isHighlighted: Bool, isVisible: Bool = true) -> some View {
    padding(.bottom, 3)
      .overlay(alignment: .bottom) {
        Capsule()
          .fill(isHighlighted ? AnyShapeStyle(Color.accentColor) : AnyShapeStyle(.tertiary))
          .frame(height: 2)
          .padding(.horizontal, 2)
          .opacity(isVisible ? 1 : 0)
      }
  }
}
