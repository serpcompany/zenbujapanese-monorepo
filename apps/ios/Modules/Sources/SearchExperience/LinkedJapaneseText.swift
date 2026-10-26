import SwiftUI

struct LinkedEntryReader: Sendable {
  var entries: @Sendable ([LanguageReferenceID]) async -> [DictionaryEntry]

  static let live = LinkedEntryReader { ids in
    let read = (try? await LookupClient.live.entries(ids)) ?? [:]
    return ids.compactMap { read[$0] }
  }

  @MainActor
  func open(_ words: [LinkedWordEntry], _ show: @escaping @MainActor ([DictionaryEntry]) -> Void) {
    Task { @MainActor in
      let read = await entries(words.map(\.id))
      guard !read.isEmpty else { return }
      show(read)
    }
  }
}

extension EnvironmentValues {
  @Entry var linkedEntryReader = LinkedEntryReader.live
}

struct LinkedJapaneseWords: View {
  @Environment(ReadingAidPreferences.self) private var readingAidPreferences

  enum Presentation {
    case standard
    case compactNaturalFlow
    case compactLinks

    var usesDedicatedWordSelector: Bool { self == .compactNaturalFlow }
    var usesMinimumHitRegionHeight: Bool { self == .standard }
  }

  @ScaledMetric(relativeTo: .body) private var lineSpacing: CGFloat = 3

  let text: String
  let tokens: [JapaneseTextToken]
  let identifierPrefix: String
  let presentation: Presentation
  let japaneseIdentifier: String?
  let openCandidates: ((_ surface: String, _ candidates: [DictionaryEntry]) -> Void)?
  let openWord: (DictionaryEntry) -> Void

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
      if readingAidPreferences.showsRomaji {
        if let romaji = PresentationCore.shared.romaji(
          of: tokens.map { ($0.surface, $0.reading) })
        {
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
  }

  private var japaneseContent: some View {
    LinkedTokenLayout(
      itemSpacing: 0,
      lineSpacing: readingAidPreferences.showsWordMeanings ? lineSpacing * 3 : lineSpacing
    ) {
      ForEach(tokens) { token in
        LinkedTokenView(
          token: token,
          identifier: "\(identifierPrefix).\(token.id).\(token.surface)",
          presentation: presentation,
          openWord: openWord,
          openCandidates: openCandidates
        )
        .layoutValue(
          key: JapaneseTokenLineBreakBehaviorKey.self,
          value: token.lineBreak
        )
        .layoutValue(
          key: JapaneseTokenAllowsInternalWrappingKey.self,
          value: token.entry == nil && token.candidateEntries.isEmpty
        )
      }
    }
  }
}

private struct LinkedTokenView: View {
  @Environment(ReadingAidPreferences.self) private var readingAidPreferences
  @Environment(WordKnowledge.self) private var wordKnowledge
  @Environment(\.linkedEntryReader) private var linkedEntries
  let token: JapaneseTextToken
  let identifier: String
  let presentation: LinkedJapaneseWords.Presentation
  let openWord: (DictionaryEntry) -> Void
  let openCandidates: ((_ surface: String, _ candidates: [DictionaryEntry]) -> Void)?

  private var isCurrentEntry: Bool { token.accent == .entry }
  private var isHighlighted: Bool { token.accent != nil }

  private func meaning(for entry: LinkedWordEntry) -> String? {
    guard readingAidPreferences.showsWordMeanings,
      !token.isFunctionWord,
      !wordKnowledge.isKnown(entry.id)
    else { return nil }
    return entry.gloss
  }

  private func hidesFurigana(for entry: LinkedWordEntry) -> Bool {
    readingAidPreferences.hidesFuriganaOnKnownWords && !isHighlighted
      && wordKnowledge.isKnown(entry.id)
  }

  private var wordColor: Color {
    isHighlighted ? Color.accentColor : Color.primary
  }

  private var minimumHitRegionHeight: CGFloat? {
    presentation.usesMinimumHitRegionHeight ? 44 : nil
  }

  private func rubyText(for entry: LinkedWordEntry) -> some View {
    JapaneseRubyText(
      ruby: token.ruby ?? JapaneseRuby(surface: token.surface, reading: entry.reading),
      exposesAccessibility: false,
      displaysRomaji: false,
      hidesFurigana: hidesFurigana(for: entry),
      highlightsKanjiOnTap: false
    )
    .foregroundStyle(wordColor)
  }

  private var candidateLabel: some View {
    Text(token.surface)
      .font(.body)
      .foregroundStyle(wordColor)
      .wordUnderline(isHighlighted: isHighlighted)
      .frame(minHeight: minimumHitRegionHeight, alignment: .bottom)
      .contentShape(Rectangle())
  }

  var body: some View {
    if let entry = token.entry {
      if presentation.usesDedicatedWordSelector {
        rubyText(for: entry)
          .accessibilityElement(children: .ignore)
          .accessibilityLabel(token.surface)
          .accessibilityIdentifier(identifier)
      } else {
        Button {
          linkedEntries.open([entry]) { openWord($0[0]) }
        } label: {
          rubyText(for: entry)
            .wordUnderline(
              isHighlighted: isHighlighted,
              isVisible: isHighlighted || !wordKnowledge.isKnown(entry.id)
            )
            .modifier(WordMeaning(meaning: meaning(for: entry)))
            .frame(minHeight: minimumHitRegionHeight, alignment: .bottom)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
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
          linkedEntries.open(token.candidateEntries) { openCandidates(token.surface, $0) }
        } label: {
          candidateLabel
        }
        .buttonStyle(.plain)
        .candidateChoiceAccessibility(token: token, identifier: identifier)
      } else {
        Menu {
          ForEach(token.candidateEntries) { candidate in
            Button {
              linkedEntries.open([candidate]) { openWord($0[0]) }
            } label: {
              Text("\(candidate.headword) (\(candidate.reading)) — \(candidate.summary)")
            }
          }
        } label: {
          candidateLabel
        }
        .buttonStyle(.plain)
        .contentShape(Rectangle())
        .candidateChoiceAccessibility(token: token, identifier: identifier)
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
  fileprivate func candidateChoiceAccessibility(
    token: JapaneseTextToken, identifier: String
  ) -> some View {
    accessibilityLabel("\(token.surface), choose dictionary entry")
      .accessibilityHint("Shows \(token.candidateEntries.count) possible dictionary entries")
      .accessibilityIdentifier(identifier)
  }

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
