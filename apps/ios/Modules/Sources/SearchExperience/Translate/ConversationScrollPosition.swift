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

struct ConversationRowFloor {
  private var conversation: ObjectIdentifier?
  private var mostRows = 0

  mutating func hold(_ rows: Int, of conversation: ObjectIdentifier) {
    mostRows = self.conversation == conversation ? max(mostRows, rows) : rows
    self.conversation = conversation
  }

  func placeholders(for rows: Int, of conversation: ObjectIdentifier) -> Int {
    self.conversation == conversation ? max(0, mostRows - rows) : 0
  }
}
