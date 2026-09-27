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
  /// Accents the words that make up each occurrence of `highlightedQuery` in the text.
  let highlightsQuery: Bool
  let tokensChanged: ([JapaneseTextToken]) -> Void
  let openWord: (DictionaryEntry) -> Void

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
        LinkedTokenLayout(itemSpacing: 0, lineSpacing: lineSpacing) {
          ForEach(tokens) { token in
            LinkedTokenView(
              token: token,
              identifier: "\(identifierPrefix).\(token.id).\(token.surface)",
              presentation: presentation,
              isCurrentEntry: isCurrentEntry(token),
              matchesQuery: queryRanges.contains { $0.overlaps(token.scalarRange) },
              openWord: openWord
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

  /// Unicode-scalar ranges of every occurrence of the query, matching token scalar ranges.
  private var queryScalarRanges: [Range<Int>] {
    let scalars = Array(text.unicodeScalars)
    let query = Array(highlightedQuery.value.unicodeScalars)
    guard !query.isEmpty, query.count <= scalars.count else { return [] }
    return (0...(scalars.count - query.count)).compactMap { start in
      scalars[start..<(start + query.count)].elementsEqual(query)
        ? start..<(start + query.count) : nil
    }
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
  let token: JapaneseTextToken
  let identifier: String
  let presentation: LinkedJapaneseText.Presentation
  let isCurrentEntry: Bool
  let matchesQuery: Bool
  let openWord: (DictionaryEntry) -> Void

  private var isHighlighted: Bool { isCurrentEntry || matchesQuery }

  /// The entry's reading when the text uses one of its forms; otherwise the parsed reading of
  /// the text itself, so an inflected word such as 見なかった gets furigana for 見, not 見る.
  private func displayReading(for entry: DictionaryEntry) -> String {
    let forms = [entry.headword] + entry.writtenForms.map(\.value) + entry.readingForms.map(\.value)
    guard !forms.contains(token.surface), let reading = token.reading, !reading.isEmpty else {
      return entry.reading
    }
    return reading.applyingTransform(.hiraganaToKatakana, reverse: true) ?? reading
  }

  var body: some View {
    if let entry = token.entry {
      if presentation.usesDedicatedWordSelector {
        JapaneseRubyText(
          surface: token.surface,
          reading: displayReading(for: entry),
          exposesAccessibility: false,
          displaysRomaji: false
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
            displaysRomaji: false
          )
          // Each word's own underline carries the interactive affordance and shows where
          // one parsed word ends and the next begins. The current entry or query match is
          // accented, ruby included, so it stays associated with its base text.
          .foregroundStyle(isHighlighted ? Color.accentColor : Color.primary)
          .wordUnderline(isHighlighted: isHighlighted)
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

extension View {
  /// A short underline inset from both edges, so adjacent words read as separate pieces.
  fileprivate func wordUnderline(isHighlighted: Bool) -> some View {
    padding(.bottom, 3)
      .overlay(alignment: .bottom) {
        Capsule()
          .fill(isHighlighted ? AnyShapeStyle(Color.accentColor) : AnyShapeStyle(.tertiary))
          .frame(height: 2)
          .padding(.horizontal, 2)
      }
  }
}

private struct LinkedTokenLayout: Layout {
  let itemSpacing: CGFloat
  let lineSpacing: CGFloat

  func sizeThatFits(
    proposal: ProposedViewSize,
    subviews: Subviews,
    cache: inout ()
  ) -> CGSize {
    layout(proposal: proposal, subviews: subviews).size
  }

  func placeSubviews(
    in bounds: CGRect,
    proposal: ProposedViewSize,
    subviews: Subviews,
    cache: inout ()
  ) {
    let result = layout(
      proposal: ProposedViewSize(width: bounds.width, height: proposal.height),
      subviews: subviews
    )
    for (index, point) in result.points.enumerated() {
      subviews[index].place(
        at: CGPoint(x: bounds.minX + point.x, y: bounds.minY + point.y),
        anchor: .topLeading,
        proposal: result.proposals[index]
      )
    }
  }

  private func layout(
    proposal: ProposedViewSize,
    subviews: Subviews
  ) -> (size: CGSize, points: [CGPoint], proposals: [ProposedViewSize]) {
    let availableWidth = proposal.width ?? .infinity
    let proposals = subviews.map { subview in
      let intrinsic = subview.dimensions(in: .unspecified)
      return
        subview[JapaneseTokenAllowsInternalWrappingKey.self]
        && availableWidth.isFinite
        && intrinsic.width > availableWidth
        ? ProposedViewSize(width: availableWidth, height: nil)
        : .unspecified
    }
    let items = zip(subviews, proposals).map { subview, childProposal in
      let dimensions = subview.dimensions(in: childProposal)
      return JapaneseTokenLineLayout.Item(
        size: CGSize(width: dimensions.width, height: dimensions.height),
        lastTextBaseline: dimensions[VerticalAlignment.lastTextBaseline],
        breakBehavior: subview[JapaneseTokenLineBreakBehaviorKey.self]
      )
    }
    let result = JapaneseTokenLineLayout.arrange(
      items: items,
      availableWidth: availableWidth,
      itemSpacing: itemSpacing,
      lineSpacing: lineSpacing
    )
    return (
      CGSize(width: proposal.width ?? result.size.width, height: result.size.height),
      result.origins,
      proposals
    )
  }
}

enum JapaneseTokenLineBreakBehavior: Equatable, Sendable {
  case normal
  case attachesToPrevious
  case attachesToNext
}

private struct JapaneseTokenLineBreakBehaviorKey: LayoutValueKey {
  static let defaultValue = JapaneseTokenLineBreakBehavior.normal
}

private struct JapaneseTokenAllowsInternalWrappingKey: LayoutValueKey {
  static let defaultValue = false
}

struct JapaneseTokenLineLayout {
  struct Item: Sendable {
    let size: CGSize
    let lastTextBaseline: CGFloat
    let breakBehavior: JapaneseTokenLineBreakBehavior
  }

  struct Result: Sendable {
    let size: CGSize
    let origins: [CGPoint]
  }

  static func arrange(
    items: [Item],
    availableWidth: CGFloat,
    itemSpacing: CGFloat,
    lineSpacing: CGFloat
  ) -> Result {
    guard !items.isEmpty else { return Result(size: .zero, origins: []) }
    let groups = unbreakableGroups(items)
    var lines: [[Int]] = []
    var currentLine: [Int] = []
    var currentWidth: CGFloat = 0

    for group in groups {
      let groupWidth = width(of: group, items: items, itemSpacing: itemSpacing)
      let proposedWidth = currentWidth + (currentLine.isEmpty ? 0 : itemSpacing) + groupWidth
      if !currentLine.isEmpty, proposedWidth > availableWidth {
        lines.append(currentLine)
        currentLine = group
        currentWidth = groupWidth
      } else {
        currentLine.append(contentsOf: group)
        currentWidth = proposedWidth
      }
    }
    if !currentLine.isEmpty { lines.append(currentLine) }

    var origins = Array(repeating: CGPoint.zero, count: items.count)
    var y: CGFloat = 0
    var measuredWidth: CGFloat = 0
    for (lineIndex, line) in lines.enumerated() {
      let baselines = line.map { validBaseline(for: items[$0]) }
      let lineBaseline = baselines.max() ?? 0
      let lineDescent =
        zip(line, baselines).map { index, baseline in
          items[index].size.height - baseline
        }.max() ?? 0
      var x: CGFloat = 0
      for (position, index) in line.enumerated() {
        if position > 0 { x += itemSpacing }
        origins[index] = CGPoint(x: x, y: y + lineBaseline - baselines[position])
        x += items[index].size.width
      }
      measuredWidth = max(measuredWidth, x)
      y += lineBaseline + lineDescent
      if lineIndex < lines.count - 1 { y += lineSpacing }
    }
    return Result(size: CGSize(width: measuredWidth, height: y), origins: origins)
  }

  private static func unbreakableGroups(_ items: [Item]) -> [[Int]] {
    var groups: [[Int]] = []
    for index in items.indices {
      let attachesToCurrentGroup =
        index > items.startIndex
        && (items[index].breakBehavior == .attachesToPrevious
          || items[items.index(before: index)].breakBehavior == .attachesToNext)
      if attachesToCurrentGroup {
        groups[groups.count - 1].append(index)
      } else {
        groups.append([index])
      }
    }
    return groups
  }

  private static func width(
    of group: [Int],
    items: [Item],
    itemSpacing: CGFloat
  ) -> CGFloat {
    group.enumerated().reduce(0) { width, element in
      width + (element.offset == 0 ? 0 : itemSpacing) + items[element.element].size.width
    }
  }

  private static func validBaseline(for item: Item) -> CGFloat {
    guard item.lastTextBaseline.isFinite,
      item.lastTextBaseline >= 0,
      item.lastTextBaseline <= item.size.height
    else { return item.size.height }
    return item.lastTextBaseline
  }
}

extension String {
  var japaneseTokenLineBreakBehavior: JapaneseTokenLineBreakBehavior {
    let scalars = unicodeScalars
    guard !scalars.isEmpty,
      scalars.allSatisfy({ scalar in
        switch scalar.properties.generalCategory {
        case .openPunctuation, .closePunctuation, .initialPunctuation, .finalPunctuation,
          .otherPunctuation:
          true
        default:
          false
        }
      })
    else { return .normal }

    switch scalars.first?.properties.generalCategory {
    case .openPunctuation, .initialPunctuation:
      return .attachesToNext
    default:
      return .attachesToPrevious
    }
  }
}
