import SwiftUI

struct FrequencyRankChip: View {
  let presentation: FrequencyPresentationModel
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @ScaledMetric(relativeTo: .caption) private var horizontalPadding = 6.0
  @ScaledMetric(relativeTo: .caption) private var verticalPadding = 2.0
  @ScaledMetric(relativeTo: .caption) private var cornerRadius = 6.0

  var body: some View {
    let layout =
      dynamicTypeSize.isAccessibilitySize
      ? AnyLayout(VStackLayout(alignment: .leading, spacing: 0))
      : AnyLayout(HStackLayout(spacing: horizontalPadding * 0.67))
    layout {
      HStack(spacing: horizontalPadding * 0.67) {
        FrequencyTierMarker(tier: presentation.tier)
        Text(presentation.packName)
          .foregroundStyle(.secondary)
      }
      Text(presentation.inlineText)
        .monospacedDigit()
        .foregroundStyle(.primary)
        .layoutPriority(1)
    }
    .font(.caption)
    .lineLimit(1)
    .padding(.horizontal, horizontalPadding)
    .padding(.vertical, verticalPadding)
    .overlay {
      RoundedRectangle(cornerRadius: cornerRadius)
        .strokeBorder(.separator, lineWidth: 1)
    }
  }
}

struct FrequencyTierMarker: View {
  let tier: FrequencyTier?
  @Environment(\.accessibilityDifferentiateWithoutColor) private var differentiateWithoutColor
  @ScaledMetric(relativeTo: .caption) private var dotSize = 6.0

  var body: some View {
    if differentiateWithoutColor {
      if let tier {
        Text("\(tier.rawValue)★")
          .monospacedDigit()
          .foregroundStyle(.secondary)
      }
    } else {
      Circle()
        .fill(tier?.color ?? Color.secondary)
        .frame(width: dotSize, height: dotSize)
    }
  }
}

struct FrequencyAdditionalRanksChip: View {
  let count: Int
  @ScaledMetric(relativeTo: .caption) private var horizontalPadding = 6.0
  @ScaledMetric(relativeTo: .caption) private var verticalPadding = 2.0
  @ScaledMetric(relativeTo: .caption) private var cornerRadius = 6.0

  var body: some View {
    Text("+\(count)")
      .font(.caption.monospacedDigit())
      .foregroundStyle(.secondary)
      .lineLimit(1)
      .padding(.horizontal, horizontalPadding)
      .padding(.vertical, verticalPadding)
      .overlay {
        RoundedRectangle(cornerRadius: cornerRadius)
          .strokeBorder(.separator, lineWidth: 1)
      }
  }
}

extension FrequencyTier {
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
