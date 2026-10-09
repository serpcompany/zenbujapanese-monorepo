import CoreGraphics

struct ConversationScrollPosition: Equatable {
  static let bottomMargin: CGFloat = 60

  let offset: CGFloat
  let isNearBottom: Bool

  init(offset: CGFloat, visibleHeight: CGFloat, contentHeight: CGFloat) {
    self.offset = offset
    isNearBottom = offset + visibleHeight >= contentHeight - Self.bottomMargin
  }

  func keepsFollowing(_ isFollowing: Bool, after earlier: ConversationScrollPosition) -> Bool {
    if isNearBottom { return true }
    if offset < earlier.offset - 1 { return false }
    return isFollowing
  }
}
