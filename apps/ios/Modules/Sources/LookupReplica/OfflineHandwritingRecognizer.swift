import Foundation

enum OfflineHandwritingRecognizer {
  static func candidates(for sample: HandwritingSample) -> [HandwritingCandidate] {
    let strokes = sample.strokes.compactMap(StrokeFeatures.init)
    let values: [String]
    switch strokes.map(\.direction) {
    case [.horizontal]:
      values = ["一", "二", "十"]
    case [.horizontal, .vertical]
      where strokes[0].centerY < 0.42 && abs(strokes[1].startY - strokes[0].centerY) < 0.2:
      values = ["丁", "下", "十"]
    case [.vertical, .horizontal, .vertical, .horizontal, .horizontal]:
      values = ["日", "目", "田"]
    case [.horizontal, .vertical, .diagonalDownLeft, .diagonalDownRight, .horizontal]:
      values = ["本", "木", "未"]
    case [.vertical, .diagonalDownRight, .vertical]
      where strokes[0].centerX > 0.35 && strokes[0].centerX < 0.65
        && strokes[1].startX < 0.35 && strokes[1].endX > 0.35
        && strokes[2].centerX > 0.65
        && strokes.allSatisfy({ $0.endY > 0.65 }):
      values = ["山", "凵", "出"]
    case [.diagonalDownRight, .vertical, .diagonalDownLeft]
      where strokes[0].startX < 0.35 && strokes[0].endY > 0.65
        && strokes[1].centerX > 0.35 && strokes[1].centerX < 0.65
        && strokes[1].endY > 0.65
        && strokes[2].startX > 0.65 && strokes[2].endY > 0.65:
      values = ["山", "凵", "出"]
    case [.vertical, .vertical, .vertical]
      where strokes[0].startX < 0.35 && strokes[0].endX > strokes[0].startX
        && strokes[1].centerX > 0.35 && strokes[1].centerX < 0.65
        && strokes[2].startX > 0.65 && strokes[2].endX < strokes[2].startX
        && strokes.allSatisfy({ $0.endY > 0.65 }):
      values = ["山", "凵", "出"]
    default:
      values = []
    }
    return values.map(HandwritingCandidate.init(value:))
  }
}

private struct StrokeFeatures {
  enum Direction {
    case horizontal
    case vertical
    case diagonalDownLeft
    case diagonalDownRight
    case other
  }

  let direction: Direction
  let startX: Double
  let startY: Double
  let endX: Double
  let endY: Double
  let centerX: Double
  let centerY: Double

  init?(_ points: [HandwritingPoint]) {
    guard let first = points.first, let last = points.last else { return nil }
    let deltaX = last.x - first.x
    let deltaY = last.y - first.y
    startX = first.x
    startY = first.y
    endX = last.x
    endY = last.y
    centerX = (first.x + last.x) / 2
    centerY = (first.y + last.y) / 2
    if abs(deltaX) > abs(deltaY) * 1.8 {
      direction = .horizontal
    } else if abs(deltaY) > abs(deltaX) * 1.8 {
      direction = .vertical
    } else if deltaX < 0, deltaY > 0 {
      direction = .diagonalDownLeft
    } else if deltaX > 0, deltaY > 0 {
      direction = .diagonalDownRight
    } else {
      direction = .other
    }
  }
}
