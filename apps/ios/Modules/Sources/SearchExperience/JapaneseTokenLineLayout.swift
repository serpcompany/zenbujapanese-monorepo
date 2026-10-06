import SwiftUI

struct LinkedTokenLayout: Layout {
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

struct JapaneseTokenLineBreakBehaviorKey: LayoutValueKey {
  static let defaultValue = JapaneseTokenLineBreakBehavior.normal
}

struct JapaneseTokenAllowsInternalWrappingKey: LayoutValueKey {
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
