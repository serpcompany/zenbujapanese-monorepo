import SwiftUI

struct ExamplePlace: Equatable {
  let row: ExampleSentenceID
  let top: CGFloat

  func isLost(_ frame: CGRect, in list: CGRect) -> Bool {
    abs(frame.minY - list.minY - top) > list.height / 3
  }

  func isTaken(by frame: CGRect, from list: CGRect, height: CGFloat) -> Bool {
    let middle = list.minY + top + height / 2
    return frame.minY <= middle && middle < frame.maxY
  }

  func anchor(rowHeight: CGFloat, listHeight: CGFloat) -> UnitPoint {
    let room = listHeight - rowHeight
    guard room > 0 else { return .top }
    let share = top / room
    return share < 1 / 3 ? .top : share < 2 / 3 ? .center : .bottom
  }
}

struct ExamplePlaceCorrection: Equatable {
  let row: ExampleSentenceID
  let anchor: UnitPoint
}

@MainActor
final class ExamplePlaceKeeper {
  static let settling: TimeInterval = 1.5

  private var rows: [ExampleSentenceID: CGRect] = [:]
  private var list = CGRect.zero
  private(set) var left: ExamplePlace?
  private var settlingUntil: Date?
  private var laidOutSinceReturn: Set<ExampleSentenceID> = []
  private var correcting = false

  func noteList(_ frame: CGRect) {
    list = frame
  }

  func note(_ row: ExampleSentenceID, at frame: CGRect, now: Date = .now) -> ExamplePlaceCorrection? {
    rows[row] = frame
    endSettling(ifOverAt: now)
    guard settlingUntil != nil else { return nil }
    laidOutSinceReturn.insert(row)
    return correction()
  }

  func leave(from row: ExampleSentenceID) {
    left = rows[row].map { ExamplePlace(row: row, top: $0.minY - list.minY) }
    settlingUntil = nil
    laidOutSinceReturn = []
    correcting = false
  }

  func comeBack(now: Date = .now) -> ExamplePlaceCorrection? {
    endSettling(ifOverAt: now)
    guard left != nil else { return nil }
    settlingUntil = now.addingTimeInterval(Self.settling)
    laidOutSinceReturn = []
    return correction()
  }

  func corrected() {
    correcting = false
  }

  func userScrolled() {
    forget()
  }

  private func forget() {
    left = nil
    settlingUntil = nil
    laidOutSinceReturn = []
    correcting = false
  }

  private func endSettling(ifOverAt now: Date) {
    guard let until = settlingUntil, now >= until else { return }
    if laidOutSinceReturn.isEmpty { settlingUntil = nil } else { forget() }
  }

  private func correction() -> ExamplePlaceCorrection? {
    guard let left, settlingUntil != nil, !correcting, let frame = rows[left.row] else {
      return nil
    }
    let taken = laidOutSinceReturn.contains { other in
      other != left.row
        && rows[other].map { left.isTaken(by: $0, from: list, height: frame.height) } == true
    }
    let pushedAway = taken && !laidOutSinceReturn.contains(left.row)
    guard pushedAway || left.isLost(frame, in: list) else { return nil }
    correcting = true
    return ExamplePlaceCorrection(
      row: left.row, anchor: left.anchor(rowHeight: frame.height, listHeight: list.height))
  }
}
