import SwiftUI

struct LinkedJapaneseText: View {
  enum Presentation {
    case standard
    case compactNaturalFlow

    var usesMinimumHitRegion: Bool { self == .standard }
  }

  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @State private var tokens: [JapaneseTextToken] = []

  let text: String
  let highlightedQuery: SearchQuery
  let highlightedEntry: DictionaryEntry?
  let japaneseTextAnalysisClient: JapaneseTextAnalysisClient
  let identifierPrefix: String
  let presentation: Presentation
  let highlightsCurrentEntry: Bool
  let openWord: (DictionaryEntry) -> Void

  init(
    text: String,
    highlightedQuery: SearchQuery,
    highlightedEntry: DictionaryEntry?,
    japaneseTextAnalysisClient: JapaneseTextAnalysisClient,
    identifierPrefix: String,
    presentation: Presentation = .standard,
    highlightsCurrentEntry: Bool = false,
    openWord: @escaping (DictionaryEntry) -> Void
  ) {
    self.text = text
    self.highlightedQuery = highlightedQuery
    self.highlightedEntry = highlightedEntry
    self.japaneseTextAnalysisClient = japaneseTextAnalysisClient
    self.identifierPrefix = identifierPrefix
    self.presentation = presentation
    self.highlightsCurrentEntry = highlightsCurrentEntry
    self.openWord = openWord
  }

  var body: some View {
    Group {
      if tokens.isEmpty {
        Text(text)
          .font(.title3)
      } else if dynamicTypeSize.isAccessibilitySize, presentation == .standard {
        VStack(alignment: .leading, spacing: 6) {
          ForEach(tokens) { token in
            LinkedTokenView(
              token: token,
              identifier: "\(identifierPrefix).\(token.id).\(token.surface)",
              presentation: presentation,
              isCurrentEntry: isCurrentEntry(token),
              openWord: openWord
            )
          }
        }
      } else {
        LinkedTokenLayout(spacing: 3, dynamicTypeSize: dynamicTypeSize) {
          ForEach(tokens) { token in
            LinkedTokenView(
              token: token,
              identifier: "\(identifierPrefix).\(token.id).\(token.surface)",
              presentation: presentation,
              isCurrentEntry: isCurrentEntry(token),
              openWord: openWord
            )
          }
        }
      }
    }
    .accessibilityElement(children: .contain)
    .task(id: highlightedEntry?.id) {
      tokens = await japaneseTextAnalysisClient.linkedTokens(
        text,
        highlightedQuery,
        highlightedEntry
      )
    }
  }

  private func isCurrentEntry(_ token: JapaneseTextToken) -> Bool {
    guard highlightsCurrentEntry, let highlightedEntry else { return false }
    return token.represents(highlightedEntry)
  }
}

private struct LinkedTokenView: View {
  let token: JapaneseTextToken
  let identifier: String
  let presentation: LinkedJapaneseText.Presentation
  let isCurrentEntry: Bool
  let openWord: (DictionaryEntry) -> Void

  var body: some View {
    if let entry = token.entry {
      Button {
        openWord(entry)
      } label: {
        JapaneseRubyText(
          surface: token.surface,
          reading: entry.reading,
          underlined: true,
          exposesAccessibility: false
        )
        // Underlining carries the interactive affordance. Inline Word Detail
        // examples additionally accent the complete current token so its ruby
        // stays visually associated with its base text.
        .foregroundStyle(isCurrentEntry ? Color.accentColor : Color.primary)
      }
      .buttonStyle(.plain)
      .frame(
        minWidth: presentation.usesMinimumHitRegion ? 44 : nil,
        minHeight: presentation.usesMinimumHitRegion ? 44 : nil
      )
      .contentShape(Rectangle())
      .accessibilityLabel("\(token.surface), \(entry.reading), \(entry.summary)")
      .accessibilityValue(isCurrentEntry ? "Current word" : "")
      .accessibilityAddTraits(isCurrentEntry ? .isSelected : [])
      .accessibilityIdentifier(identifier)
    } else {
      Text(token.surface)
        .font(.body)
        .accessibilityIdentifier(identifier)
    }
  }
}

private struct LinkedTokenLayout: Layout {
  let spacing: CGFloat
  let dynamicTypeSize: DynamicTypeSize

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
        proposal: .unspecified
      )
    }
  }

  private func layout(
    proposal: ProposedViewSize,
    subviews: Subviews
  ) -> (size: CGSize, points: [CGPoint]) {
    let availableWidth = proposal.width ?? .infinity
    var points: [CGPoint] = []
    var sizes: [CGSize] = []
    var x: CGFloat = 0
    var y: CGFloat = 0
    var lineHeight: CGFloat = 0
    var lineStart = 0

    for subview in subviews {
      let size = subview.sizeThatFits(.unspecified)
      if x > 0, x + size.width > availableWidth {
        bottomAlign(points: &points, sizes: sizes, from: lineStart, height: lineHeight)
        x = 0
        y += lineHeight + spacing
        lineHeight = 0
        lineStart = points.count
      }
      points.append(CGPoint(x: x, y: y))
      sizes.append(size)
      x += size.width + spacing
      lineHeight = max(lineHeight, size.height)
    }
    bottomAlign(points: &points, sizes: sizes, from: lineStart, height: lineHeight)
    return (CGSize(width: proposal.width ?? x, height: y + lineHeight), points)
  }

  private func bottomAlign(
    points: inout [CGPoint],
    sizes: [CGSize],
    from lineStart: Int,
    height: CGFloat
  ) {
    guard lineStart < points.count else { return }
    for index in lineStart..<points.count {
      points[index].y += height - sizes[index].height
    }
  }
}
