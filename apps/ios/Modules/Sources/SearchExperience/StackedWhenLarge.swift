import SwiftUI

struct StackedWhenLarge<Content: View>: View {
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  let spacing: CGFloat
  var across: CGFloat?
  var alignment = HorizontalAlignment.leading
  @ViewBuilder let content: () -> Content

  var body: some View {
    let layout =
      dynamicTypeSize.isAccessibilitySize
      ? AnyLayout(VStackLayout(alignment: alignment, spacing: spacing))
      : AnyLayout(HStackLayout(spacing: across))
    layout(content)
  }
}
