import SwiftUI

struct ExamplePlace: Equatable {
  let row: ExampleSentenceID
  let top: CGFloat
  let height: CGFloat

  func anchor(rowHeight: CGFloat, listHeight: CGFloat) -> UnitPoint {
    let room = listHeight - rowHeight
    guard room > 0 else { return .top }
    return UnitPoint(x: 0.5, y: min(max(top / room, 0), 1))
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
  private var correcting = false

  func noteList(_ frame: CGRect) {
    list = frame
  }

  func note(_ row: ExampleSentenceID, at frame: CGRect, now: Date = .now) -> ExamplePlaceCorrection? {
    rows[row] = frame
    return correction(now: now)
  }

  func leave(from row: ExampleSentenceID) {
    left = rows[row].map {
      ExamplePlace(row: row, top: $0.minY - list.minY, height: $0.height)
    }
    settlingUntil = nil
    correcting = false
  }

  func comeBack(now: Date = .now) -> ExamplePlaceCorrection? {
    guard left != nil else { return nil }
    if settlingUntil == nil { settlingUntil = now.addingTimeInterval(Self.settling) }
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
    correcting = false
  }

  private func correction(now: Date) -> ExamplePlaceCorrection? {
    guard let left, let until = settlingUntil, !correcting else { return nil }
    guard now < until else {
      forget()
      return nil
    }
    correcting = true
    let height = rows[left.row]?.height ?? left.height
    return ExamplePlaceCorrection(
      row: left.row, anchor: left.anchor(rowHeight: height, listHeight: list.height))
  }
}
