import SwiftUI

struct PitchAccentBadge: View {
  let reading: String
  let pitch: PitchAccent
  let pronounce: () -> Void
  @ScaledMetric(relativeTo: .body) private var moraWidth: CGFloat = 20
  @ScaledMetric(relativeTo: .body) private var contourSpace = 7.0
  @ScaledMetric(relativeTo: .body) private var horizontalPadding = 10.0

  var body: some View {
    let layout = PitchContourLayout(reading: reading, pitch: pitch)
    Button(action: pronounce) {
      HStack(spacing: 6) {
        Image(systemName: "speaker.wave.2.fill")
          .font(.subheadline)
          .foregroundStyle(.tint)
        contour(layout)
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

  private func contour(_ layout: PitchContourLayout) -> some View {
    HStack(spacing: 0) {
      ForEach(layout.morae.enumerated(), id: \.offset) { index, mora in
        Text(mora)
          .font(.body)
          .lineLimit(1)
          .fixedSize()
          .frame(width: moraWidth * layout.widths[index])
      }
      Color.clear.frame(width: moraWidth * PitchContourLayout.particleWidth, height: 1)
    }
    .padding(.vertical, contourSpace)
    .overlay {
      PitchContour(layout: layout, moraWidth: moraWidth)
        .foregroundStyle(ZenbuTheme.pitchDownstep)
    }
  }
}

struct PitchContourLayout: Equatable {
  struct Point: Equatable {
    let x: Double
    let high: Bool
  }

  static let particleWidth = 0.6

  let morae: [String]
  let widths: [Double]
  let points: [Point]
  let particle: Point

  init(reading: String, pitch: PitchAccent) {
    morae = reading.katakana.morae
    widths = morae.map { $0.count > 1 ? 1.5 : 1 }
    let levels = pitch.levels(moraCount: morae.count)
    var x = 0.0
    var points: [Point] = []
    for (width, high) in zip(widths, levels.morae) {
      points.append(Point(x: x + width / 2, high: high))
      x += width
    }
    self.points = points
    particle = Point(x: x + Self.particleWidth / 2, high: levels.particle)
  }
}

private struct PitchContour: View {
  let layout: PitchContourLayout
  let moraWidth: CGFloat
  @ScaledMetric(relativeTo: .body) private var dotSize: CGFloat = 5

  var body: some View {
    Canvas { context, size in
      let inset = dotSize / 2 + 1
      func point(_ point: PitchContourLayout.Point) -> CGPoint {
        CGPoint(x: point.x * moraWidth, y: point.high ? inset : size.height - inset)
      }
      let moraPoints = layout.points.map(point)
      guard !moraPoints.isEmpty else { return }
      let particlePoint = point(layout.particle)
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

extension String {
  fileprivate var katakana: String {
    String(
      unicodeScalars.map { scalar in
        let value = scalar.value
        if (0x3041...0x3096).contains(value), let converted = UnicodeScalar(value + 0x60) {
          return Character(String(converted))
        }
        return Character(String(scalar))
      })
  }
}
