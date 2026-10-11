import SwiftUI

struct PitchAccentBadge: View {
  let reading: String
  let pitch: WordPage.Pitch
  let pronounce: () -> Void
  @ScaledMetric(relativeTo: .body) private var moraWidth: CGFloat = 20
  @ScaledMetric(relativeTo: .body) private var contourSpace = 7.0
  @ScaledMetric(relativeTo: .body) private var horizontalPadding = 10.0

  var body: some View {
    Button(action: pronounce) {
      HStack(spacing: 6) {
        Image(systemName: "speaker.wave.2.fill")
          .font(.subheadline)
          .foregroundStyle(.tint)
        contour
      }
      .padding(.horizontal, horizontalPadding)
      .padding(.vertical, 2)
      .frame(minHeight: 44)
      .background(.fill.tertiary, in: Capsule())
      .contentShape(Capsule())
    }
    .buttonStyle(.plain)
    .accessibilityLabel("Pronounce \(reading)")
    .accessibilityValue("Pitch accent, downstep \(pitch.downstep), \(pitch.moraCount) mora")
  }

  private var contour: some View {
    let graph = pitch.graph
    return HStack(spacing: 0) {
      ForEach(pitch.morae.enumerated(), id: \.offset) { index, mora in
        Text(mora.mora)
          .font(.body)
          .lineLimit(1)
          .fixedSize()
          .frame(width: moraWidth * graph.widths[index])
      }
      Color.clear.frame(width: moraWidth * (graph.width - graph.widths.reduce(0, +)), height: 1)
    }
    .padding(.vertical, contourSpace)
    .overlay {
      PitchContour(graph: graph, moraWidth: moraWidth)
        .foregroundStyle(ZenbuTheme.pitchDownstep)
    }
  }
}

private struct PitchContour: View {
  let graph: WordPage.Pitch.Graph
  let moraWidth: CGFloat
  @ScaledMetric(relativeTo: .body) private var dotSize: CGFloat = 5

  var body: some View {
    Canvas { context, size in
      let inset = dotSize / 2 + 1
      func point(_ point: WordPage.Pitch.Point) -> CGPoint {
        CGPoint(x: point.x * moraWidth, y: point.high ? inset : size.height - inset)
      }
      let moraPoints = graph.points.map(point)
      guard !moraPoints.isEmpty else { return }
      let particlePoint = point(graph.particle)
      var line = Path()
      line.addLines(moraPoints + [particlePoint])
      context.stroke(line, with: .foreground, lineWidth: 1.5)
      for point in moraPoints {
        context.fill(dot(at: point), with: .foreground)
      }
      context.fill(dot(at: particlePoint), with: .color(SystemColor.tertiaryFill))
      context.stroke(dot(at: particlePoint), with: .foreground, lineWidth: 1.5)
    }
    .accessibilityHidden(true)
  }

  private func dot(at point: CGPoint) -> Path {
    Path(
      ellipseIn: CGRect(
        x: point.x - dotSize / 2, y: point.y - dotSize / 2, width: dotSize, height: dotSize))
  }
}
