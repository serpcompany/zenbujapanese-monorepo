import SwiftUI

enum HitTarget {
  static let minimum: CGFloat = 44
}

struct OutsetHitTarget: Layout {
  var fillsWidth = false

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let measured =
      subviews.first?.sizeThatFits(ProposedViewSize(width: fillsWidth ? proposal.width : nil, height: nil))
      ?? .zero
    return CGSize(width: fillsWidth ? proposal.width ?? measured.width : measured.width, height: measured.height)
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    let target = ProposedViewSize(
      width: max(bounds.width, HitTarget.minimum), height: max(bounds.height, HitTarget.minimum))
    for subview in subviews {
      subview.place(at: CGPoint(x: bounds.midX, y: bounds.midY), anchor: .center, proposal: target)
    }
  }
}

private struct FillingIconLabelStyle: LabelStyle {
  func makeBody(configuration: Configuration) -> some View {
    Label(configuration)
      .labelStyle(.iconOnly)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .contentShape(.rect)
  }
}

extension View {
  func outsetHitTarget() -> some View {
    OutsetHitTarget {
      labelStyle(FillingIconLabelStyle())
    }
  }
}
