import SwiftUI

/// A dictionary name and its rank, such as "Netflix 449", colored by how common the rank is.
/// Subtle chips confine the color to a small dot so dense lists stay readable; prominent chips
/// tint the name for a single entry's detail. With Differentiate Without Color, a star count
/// replaces the color-only cue.
struct FrequencyRankChip: View {
  enum Style {
    case subtle
    case prominent
  }

  let presentation: FrequencyPresentationModel
  var style = Style.prominent
  @Environment(\.accessibilityDifferentiateWithoutColor) private var differentiateWithoutColor
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @ScaledMetric(relativeTo: .caption) private var dotSize = 6.0
  @ScaledMetric(relativeTo: .caption) private var horizontalPadding = 6.0
  @ScaledMetric(relativeTo: .caption) private var verticalPadding = 2.0
  @ScaledMetric(relativeTo: .caption) private var cornerRadius = 6.0

  var body: some View {
    let color = presentation.tier?.color ?? Color.secondary
    let stacked = dynamicTypeSize.isAccessibilitySize
    switch style {
    case .subtle:
      // At accessibility sizes the rank moves under the name instead of truncating it.
      let layout =
        stacked
        ? AnyLayout(VStackLayout(alignment: .leading, spacing: 0))
        : AnyLayout(HStackLayout(spacing: horizontalPadding * 0.67))
      layout {
        HStack(spacing: horizontalPadding * 0.67) {
          tierMarker(color: color)
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
    case .prominent:
      let layout =
        stacked
        ? AnyLayout(VStackLayout(alignment: .leading, spacing: 0))
        : AnyLayout(HStackLayout(spacing: 0))
      layout {
        HStack(spacing: horizontalPadding * 0.67) {
          if differentiateWithoutColor { tierMarker(color: color) }
          Text(presentation.packName)
        }
        .fontWeight(.semibold)
        .foregroundStyle(.primary)
        .padding(.horizontal, horizontalPadding)
        .padding(.vertical, verticalPadding)
        .frame(maxWidth: stacked ? .infinity : nil, alignment: .leading)
        .background(color.opacity(0.28))
        Text(presentation.inlineText)
          .monospacedDigit()
          .foregroundStyle(.primary)
          .padding(.horizontal, horizontalPadding)
          .padding(.vertical, verticalPadding)
          .layoutPriority(1)
      }
      .fixedSize(horizontal: stacked, vertical: false)
      .font(.caption)
      .lineLimit(1)
      .clipShape(.rect(cornerRadius: cornerRadius))
      .overlay {
        RoundedRectangle(cornerRadius: cornerRadius)
          .strokeBorder(color.opacity(0.6), lineWidth: 1)
      }
    }
  }

  /// A colored dot, or a star count such as "5★" when color alone must not carry meaning.
  @ViewBuilder
  private func tierMarker(color: Color) -> some View {
    if differentiateWithoutColor {
      if let tier = presentation.tier {
        Text("\(tier.rawValue)★")
          .monospacedDigit()
          .foregroundStyle(.secondary)
      }
    } else {
      Circle()
        .fill(color)
        .frame(width: dotSize, height: dotSize)
    }
  }
}

/// A "+N" chip counting enabled dictionaries whose chips are hidden to save space.
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
  /// Horizontal gap between chips on a line.
  var spacing: CGFloat = 6
  /// Vertical gap between lines; defaults to `spacing`.
  var lineSpacing: CGFloat?

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let rows = rows(for: subviews, width: proposal.width ?? .infinity)
    let width = rows.map(\.width).max() ?? 0
    let height =
      rows.map(\.height).reduce(0, +) + verticalGap * CGFloat(max(rows.count - 1, 0))
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
      y += row.height + verticalGap
    }
  }

  private var verticalGap: CGFloat { lineSpacing ?? spacing }

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
