import SwiftUI

struct LinkedJapaneseText: View {
  @State private var tokens: [JapaneseTextToken] = []

  let text: String
  let highlightedQuery: SearchQuery
  let highlightedEntry: DictionaryEntry?
  let japaneseTextAnalysisClient: JapaneseTextAnalysisClient
  let identifierPrefix: String
  let openWord: (DictionaryEntry) -> Void

  var body: some View {
    Group {
      if tokens.isEmpty {
        Text(text)
          .font(.system(size: 20))
      } else {
        LinkedTokenLayout(spacing: 3) {
          ForEach(tokens) { token in
            LinkedTokenView(
              token: token,
              identifier: "\(identifierPrefix).\(token.id).\(token.surface)",
              openWord: openWord
            )
          }
        }
      }
    }
    .task(id: highlightedEntry?.id) {
      tokens = await japaneseTextAnalysisClient.linkedTokens(
        text,
        highlightedQuery,
        highlightedEntry
      )
    }
  }
}

private struct LinkedTokenView: View {
  let token: JapaneseTextToken
  let identifier: String
  let openWord: (DictionaryEntry) -> Void

  var body: some View {
    if let entry = token.entry {
      Button { openWord(entry) } label: {
        VStack(spacing: 0) {
          if token.showsReading {
            Text(entry.reading)
              .font(.system(size: 10, weight: .semibold))
          }
          Text(token.surface)
            .font(.system(size: 20))
            .underline()
        }
        .foregroundStyle(ReplicaPalette.selectedTab)
      }
      .buttonStyle(.plain)
      .accessibilityLabel("\(token.surface), \(entry.reading), \(entry.summary)")
      .accessibilityIdentifier(identifier)
    } else {
      Text(token.surface)
        .font(.system(size: 20))
    }
  }
}

private struct LinkedTokenLayout: Layout {
  let spacing: CGFloat

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
