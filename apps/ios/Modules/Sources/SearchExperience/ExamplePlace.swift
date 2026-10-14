import SwiftUI

struct ExamplePlace: Equatable {
  let row: ExampleSentenceID
  let top: CGFloat

  func isLost(_ frame: CGRect, in list: CGRect) -> Bool {
    abs(frame.minY - list.minY - top) > list.height / 3
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
    guard settlingUntil != nil else { return nil }
    laidOutSinceReturn.insert(row)
    return correction(now: now)
  }

  func leave(from row: ExampleSentenceID) {
    left = rows[row].map { ExamplePlace(row: row, top: $0.minY - list.minY) }
    settlingUntil = nil
    laidOutSinceReturn = []
    correcting = false
  }

  func comeBack(now: Date = .now) -> ExamplePlaceCorrection? {
    guard left != nil else { return nil }
    settlingUntil = now.addingTimeInterval(Self.settling)
    laidOutSinceReturn = []
    return correction(now: now)
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

  private func correction(now: Date) -> ExamplePlaceCorrection? {
    guard let left, let until = settlingUntil, !correcting, let frame = rows[left.row] else {
      return nil
    }
    guard now < until else {
      if laidOutSinceReturn.isEmpty { settlingUntil = nil } else { forget() }
      return nil
    }
    let pushedAway = !laidOutSinceReturn.isEmpty && !laidOutSinceReturn.contains(left.row)
    guard pushedAway || left.isLost(frame, in: list) else { return nil }
    correcting = true
    return ExamplePlaceCorrection(
      row: left.row, anchor: left.anchor(rowHeight: frame.height, listHeight: list.height))
  }
}
