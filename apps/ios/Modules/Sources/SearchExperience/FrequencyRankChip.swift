import SwiftUI

/// A dictionary name and its rank, such as "Netflix 449", colored by how common the rank is.
/// Subtle chips confine the color to a small dot so dense lists stay readable; prominent chips
/// tint the name for a single entry's detail.
struct FrequencyRankChip: View {
  enum Style {
    case subtle
    case prominent
  }

  let presentation: FrequencyPresentationModel
  var style = Style.prominent

  var body: some View {
    let color = presentation.tier?.color ?? Color.secondary
    switch style {
    case .subtle:
      HStack(spacing: 4) {
        Circle()
          .fill(color)
          .frame(width: 6, height: 6)
        Text(presentation.packName)
          .foregroundStyle(.secondary)
        Text(presentation.inlineText)
          .monospacedDigit()
          .foregroundStyle(.primary)
          .layoutPriority(1)
      }
      .font(.caption)
      .lineLimit(1)
      .padding(.horizontal, 6)
      .padding(.vertical, 2)
      .overlay {
        RoundedRectangle(cornerRadius: 6)
          .strokeBorder(.separator, lineWidth: 1)
      }
    case .prominent:
      HStack(spacing: 0) {
        Text(presentation.packName)
          .fontWeight(.semibold)
          .foregroundStyle(.primary)
          .padding(.horizontal, 6)
          .padding(.vertical, 2)
          .background(color.opacity(0.28))
        Text(presentation.inlineText)
          .monospacedDigit()
          .foregroundStyle(.primary)
          .padding(.horizontal, 6)
          .padding(.vertical, 2)
          .layoutPriority(1)
      }
      .font(.caption)
      .lineLimit(1)
      .clipShape(.rect(cornerRadius: 6))
      .overlay {
        RoundedRectangle(cornerRadius: 6)
          .strokeBorder(color.opacity(0.6), lineWidth: 1)
      }
    }
  }
}

extension FrequencyTier {
  /// A traffic-light scale from green for the words to learn first to red for uncommon words,
  /// with gray for rare ones. System colors adapt to dark mode and Increase Contrast.
  var color: Color {
    switch self {
    case .veryCommon: .green
    case .common: .yellow
    case .moderate: .orange
    case .uncommon: .red
    case .rare: .gray
    }
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
      for (index, size) in zip(row.indices, row.sizes) {
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
    var sizes: [CGSize] = []
    var width: CGFloat = 0
    var height: CGFloat = 0
  }

  /// A chip wider than the whole row (large Dynamic Type sizes) is offered the row width so it
  /// truncates instead of widening the layout past its container.
  private func size(of subview: LayoutSubview, maxWidth: CGFloat) -> CGSize {
    let ideal = subview.sizeThatFits(.unspecified)
    guard ideal.width > maxWidth else { return ideal }
    return subview.sizeThatFits(ProposedViewSize(width: maxWidth, height: nil))
  }

  private func rows(for subviews: Subviews, width: CGFloat) -> [Row] {
    var rows: [Row] = []
    var current = Row()
    for index in subviews.indices {
      let size = size(of: subviews[index], maxWidth: width)
      let proposedWidth =
        current.indices.isEmpty ? size.width : current.width + spacing + size.width
      if proposedWidth > width, !current.indices.isEmpty {
        rows.append(current)
        current = Row(indices: [index], sizes: [size], width: size.width, height: size.height)
      } else {
        current.indices.append(index)
        current.sizes.append(size)
        current.width = proposedWidth
        current.height = max(current.height, size.height)
      }
    }
    if !current.indices.isEmpty { rows.append(current) }
    return rows
  }
}
