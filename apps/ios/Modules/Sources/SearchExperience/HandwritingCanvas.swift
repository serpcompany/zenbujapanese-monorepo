import SwiftUI

struct HandwritingCanvas: View {
  @Binding var strokes: [[HandwritingPoint]]
  let completedStroke: (HandwritingSample) -> Void
  @State private var pendingStroke: [HandwritingPoint] = []

  var body: some View {
    GeometryReader { geometry in
      Canvas { context, size in
        let grid = Path { path in
          path.move(to: CGPoint(x: size.width / 2, y: 0))
          path.addLine(to: CGPoint(x: size.width / 2, y: size.height))
          path.move(to: CGPoint(x: 0, y: size.height / 2))
          path.addLine(to: CGPoint(x: size.width, y: size.height / 2))
        }
        context.stroke(
          grid,
          with: .color(.secondary.opacity(0.22)),
          style: StrokeStyle(lineWidth: 1, dash: [4, 4])
        )
        for stroke in strokes + (pendingStroke.isEmpty ? [] : [pendingStroke]) {
          let path = Path { path in
            guard let first = stroke.first else { return }
            path.move(to: point(first, in: size))
            for pointValue in stroke.dropFirst() { path.addLine(to: point(pointValue, in: size)) }
          }
          context.stroke(
            path,
            with: .color(.primary),
            style: StrokeStyle(lineWidth: 8, lineCap: .round, lineJoin: .round)
          )
        }
      }
      .contentShape(Rectangle())
      .gesture(
        DragGesture(minimumDistance: 0, coordinateSpace: .local)
          .onChanged { value in pendingStroke.append(normalized(value.location, in: geometry.size))
          }
          .onEnded { _ in
            guard !pendingStroke.isEmpty else { return }
            let completed = pendingStroke
            pendingStroke = []
            strokes.append(completed)
            completedStroke(HandwritingSample(strokes: strokes))
          }
      )
      .background(.background, in: RoundedRectangle(cornerRadius: 16))
      .accessibilityElement()
      .accessibilityLabel("Drawing grid")
      .accessibilityValue(
        strokes.isEmpty
          ? "Empty drawing" : "\(strokes.count) stroke\(strokes.count == 1 ? "" : "s")"
      )
      .accessibilityIdentifier("handwriting.canvas")
    }
  }

  private func normalized(_ point: CGPoint, in size: CGSize) -> HandwritingPoint {
    HandwritingPoint(
      x: min(max(point.x / size.width, 0), 1), y: min(max(point.y / size.height, 0), 1))
  }

  private func point(_ point: HandwritingPoint, in size: CGSize) -> CGPoint {
    CGPoint(x: point.x * size.width, y: point.y * size.height)
  }
}
