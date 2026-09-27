import SwiftUI

/// A dictionary name and its rank, such as "Netflix 449". The primary chip belongs to the
/// enabled dictionary that orders search results.
struct FrequencyRankChip: View {
  let presentation: FrequencyPresentationModel
  var isPrimary = false

  var body: some View {
    HStack(spacing: 0) {
      Text(presentation.packName)
        .fontWeight(.semibold)
        .foregroundStyle(isPrimary ? AnyShapeStyle(.tint) : AnyShapeStyle(.secondary))
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(.fill.secondary)
      Text(presentation.inlineText)
        .monospacedDigit()
        .foregroundStyle(.primary)
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
    }
    .font(.caption)
    .lineLimit(1)
    .background(.fill.quaternary)
    .clipShape(.rect(cornerRadius: 6))
  }
}

/// A "+N" chip counting additional enabled dictionaries that rank an entry.
struct FrequencyAdditionalRanksChip: View {
  let count: Int

  var body: some View {
    Text("+\(count)")
      .font(.caption.monospacedDigit())
      .foregroundStyle(.secondary)
      .lineLimit(1)
      .padding(.horizontal, 6)
      .padding(.vertical, 2)
      .background(.fill.quaternary, in: .rect(cornerRadius: 6))
  }
}

/// Places chips left to right, wrapping to a new line when the row is full.
struct FrequencyChipFlowLayout: Layout {
  var spacing: CGFloat = 6

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let rows = rows(for: subviews, width: proposal.width ?? .infinity)
    let width = rows.map(\.width).max() ?? 0
    let height = rows.map(\.height).reduce(0, +) + spacing * CGFloat(max(rows.count - 1, 0))
    return CGSize(width: width, height: height)
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    var y = bounds.minY
    for row in rows(for: subviews, width: bounds.width) {
      var x = bounds.minX
      for index in row.indices {
        let size = subviews[index].sizeThatFits(.unspecified)
        subviews[index].place(
          at: CGPoint(x: x, y: y + (row.height - size.height) / 2),
          proposal: ProposedViewSize(size))
        x += size.width + spacing
      }
      y += row.height + spacing
    }
  }

  private struct Row {
    var indices: [Int] = []
    var width: CGFloat = 0
    var height: CGFloat = 0
  }

  private func rows(for subviews: Subviews, width: CGFloat) -> [Row] {
    var rows: [Row] = []
    var current = Row()
    for index in subviews.indices {
      let size = subviews[index].sizeThatFits(.unspecified)
      let proposedWidth =
        current.indices.isEmpty ? size.width : current.width + spacing + size.width
      if proposedWidth > width, !current.indices.isEmpty {
        rows.append(current)
        current = Row(indices: [index], width: size.width, height: size.height)
      } else {
        current.indices.append(index)
        current.width = proposedWidth
        current.height = max(current.height, size.height)
      }
    }
    if !current.indices.isEmpty { rows.append(current) }
    return rows
  }
}
