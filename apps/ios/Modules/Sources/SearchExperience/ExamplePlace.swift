import SwiftUI

struct ExamplePlace: Equatable {
  let row: ExampleSentenceID
  let top: CGFloat
  let height: CGFloat

  func isLost(_ frame: CGRect, in list: CGRect) -> Bool {
    abs(frame.minY - list.minY - top) > list.height / 3
  }

  func isCovered(by frame: CGRect, in list: CGRect) -> Bool {
    let start = list.minY + top
    return frame.minY < start + height && start < frame.maxY
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
  private var checking = false
  private var correcting = false

  func noteList(_ frame: CGRect) {
    list = frame
  }

  func note(_ row: ExampleSentenceID, at frame: CGRect, now: Date = .now) -> Bool {
    rows[row] = frame
    endSettling(ifOverAt: now)
    guard settlingUntil != nil else { return false }
    laidOutSinceReturn.insert(row)
    return askToCheck()
  }

  func leave(from row: ExampleSentenceID) {
    left = rows[row].map { ExamplePlace(row: row, top: $0.minY - list.minY, height: $0.height) }
    settlingUntil = nil
    laidOutSinceReturn = []
    checking = false
    correcting = false
  }

  func comeBack(now: Date = .now) -> Bool {
    endSettling(ifOverAt: now)
    guard left != nil else { return false }
    if settlingUntil == nil { laidOutSinceReturn = [] }
    settlingUntil = now.addingTimeInterval(Self.settling)
    return askToCheck()
  }

  func check(now: Date = .now) -> ExamplePlaceCorrection? {
    checking = false
    endSettling(ifOverAt: now)
    guard let left, settlingUntil != nil, !correcting, let frame = rows[left.row] else {
      return nil
    }
    let covered = laidOutSinceReturn.contains { other in
      other != left.row && rows[other].map { left.isCovered(by: $0, in: list) } == true
    }
    let pushedAway = covered && !laidOutSinceReturn.contains(left.row)
    guard pushedAway || left.isLost(frame, in: list) else { return nil }
    correcting = true
    return ExamplePlaceCorrection(
      row: left.row, anchor: left.anchor(rowHeight: frame.height, listHeight: list.height))
  }

  func corrected() {
    correcting = false
  }

  func userScrolled() {
    forget()
  }

  private func askToCheck() -> Bool {
    guard !checking else { return false }
    checking = true
    return true
  }

  private func forget() {
    left = nil
    settlingUntil = nil
    laidOutSinceReturn = []
    checking = false
    correcting = false
  }

  private func endSettling(ifOverAt now: Date) {
    guard let until = settlingUntil, now >= until else { return }
    if laidOutSinceReturn.isEmpty { settlingUntil = nil } else { forget() }
  }
}
