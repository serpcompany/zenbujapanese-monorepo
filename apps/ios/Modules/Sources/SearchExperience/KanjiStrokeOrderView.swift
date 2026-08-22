import SwiftUI

struct KanjiStrokeOrderView: View {
  let diagram: KanjiStrokeDiagram
  let close: () -> Void

  @State private var completedStrokeCount = 0
  @State private var activeStrokeProgress = 0.0
  @State private var isPlaying = false
  @State private var playbackTask: Task<Void, Never>?

  var body: some View {
    ZStack(alignment: .topLeading) {
      VStack(spacing: 16) {
        StrokeDrawingGrid(
          diagram: diagram,
          completedStrokeCount: completedStrokeCount,
          activeStrokeProgress: activeStrokeProgress
        )
        .aspectRatio(1, contentMode: .fit)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Stroke drawing grid for \(diagram.character.rawValue)")
        .accessibilityValue(gridAccessibilityValue)
        .accessibilityIdentifier("stroke-order.grid")

        HStack(spacing: 54) {
          Button {
            stepPrevious()
          } label: {
            Image(systemName: "backward.end.fill")
          }
          .disabled(completedStrokeCount == 0 && activeStrokeProgress == 0)
          .accessibilityLabel("Previous stroke")
          .accessibilityIdentifier("stroke-order.previous")

          Button {
            isPlaying ? pause() : play()
          } label: {
            Image(systemName: isPlaying ? "pause.fill" : "play.fill")
              .frame(width: 36)
          }
          .disabled(diagram.strokes.isEmpty)
          .accessibilityLabel(isPlaying ? "Pause stroke order" : "Play stroke order")
          .accessibilityIdentifier(isPlaying ? "stroke-order.pause" : "stroke-order.play")

          Button {
            stepNext()
          } label: {
            Image(systemName: "forward.end.fill")
          }
          .disabled(completedStrokeCount == diagram.strokes.count)
          .accessibilityLabel("Next stroke")
          .accessibilityIdentifier("stroke-order.next")
        }
        .font(.title)
        .buttonStyle(.plain)
        .foregroundStyle(ZenbuTheme.interactiveForeground)
        .frame(maxWidth: .infinity)

        Text("Stroke \(visibleStrokeIndex) of \(diagram.strokes.count)")
          .font(.caption.monospacedDigit())
          .foregroundStyle(ZenbuTheme.secondaryText)
          .accessibilityValue(
            "\(completedStrokeCount) of \(diagram.strokes.count) complete"
          )
          .accessibilityIdentifier("stroke-order.progress")
      }
      .padding(16)

      Button {
        pause()
        close()
      } label: {
        Image(systemName: "xmark.circle.fill")
          .symbolRenderingMode(.palette)
          .foregroundStyle(ZenbuTheme.primaryForeground, ZenbuTheme.background)
          .font(.title.weight(.bold))
      }
      .buttonStyle(.plain)
      .offset(x: -10, y: -10)
      .accessibilityLabel("Close stroke order")
      .accessibilityIdentifier("stroke-order.close")
    }
    .background(ZenbuTheme.row)
    .clipShape(RoundedRectangle(cornerRadius: 5))
    .shadow(color: ZenbuTheme.background.opacity(0.65), radius: 24, y: 10)
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("stroke-order.overlay")
    .onDisappear { pause() }
  }

  private var visibleStrokeIndex: Int {
    min(completedStrokeCount + 1, diagram.strokes.count)
  }

  private var gridAccessibilityValue: String {
    if activeStrokeProgress > 0 {
      return "\(completedStrokeCount) strokes complete, drawing stroke \(completedStrokeCount + 1)"
    }
    return "\(completedStrokeCount) strokes complete"
  }

  private func stepPrevious() {
    pause()
    if activeStrokeProgress > 0 {
      activeStrokeProgress = 0
    } else {
      completedStrokeCount = max(0, completedStrokeCount - 1)
    }
  }

  private func stepNext() {
    pause()
    guard completedStrokeCount < diagram.strokes.count else { return }
    activeStrokeProgress = 0.001
    startPlaybackTask {
      _ = await animateCurrentStroke(stepCount: 12, interval: .milliseconds(80))
    }
  }

  private func play() {
    guard !diagram.strokes.isEmpty else { return }
    if completedStrokeCount == diagram.strokes.count {
      completedStrokeCount = 0
      activeStrokeProgress = 0
    }
    isPlaying = true
    startPlaybackTask {
      while !Task.isCancelled, isPlaying, completedStrokeCount < diagram.strokes.count {
        guard await animateCurrentStroke(stepCount: 8, interval: .milliseconds(60)) else {
          return
        }
      }
      if completedStrokeCount == diagram.strokes.count {
        isPlaying = false
      }
    }
  }

  @MainActor
  private func animateCurrentStroke(stepCount: Int, interval: Duration) async -> Bool {
    guard completedStrokeCount < diagram.strokes.count else { return false }
    let increment = 1 / Double(stepCount)
    while activeStrokeProgress < 1 {
      do {
        try await Task.sleep(for: interval)
      } catch {
        return false
      }
      guard !Task.isCancelled else { return false }
      withAnimation(.linear(duration: interval.timeInterval)) {
        activeStrokeProgress = min(1, activeStrokeProgress + increment)
      }
    }
    guard !Task.isCancelled else { return false }
    completedStrokeCount += 1
    activeStrokeProgress = 0
    return true
  }

  private func startPlaybackTask(_ operation: @escaping @MainActor () async -> Void) {
    playbackTask?.cancel()
    playbackTask = Task { @MainActor in
      await operation()
      guard !Task.isCancelled else { return }
      playbackTask = nil
    }
  }

  private func pause() {
    isPlaying = false
    playbackTask?.cancel()
    playbackTask = nil
  }
}

extension Duration {
  fileprivate var timeInterval: TimeInterval {
    let parts = components
    return TimeInterval(parts.seconds) + TimeInterval(parts.attoseconds) / 1e18
  }
}

private struct StrokeDrawingGrid: View {
  let diagram: KanjiStrokeDiagram
  let completedStrokeCount: Int
  let activeStrokeProgress: Double

  var body: some View {
    GeometryReader { geometry in
      ZStack {
        ZenbuTheme.background.opacity(0.28)
        StrokeGridLines()
          .stroke(
            ZenbuTheme.secondaryText,
            style: StrokeStyle(lineWidth: 1, dash: [5, 4])
          )

        ForEach(Array(diagram.strokes.enumerated()), id: \.offset) { index, stroke in
          KanjiStrokeShape(stroke: stroke, viewportSize: diagram.viewportSize)
            .stroke(
              index < completedStrokeCount ? ZenbuTheme.foreground : ZenbuTheme.secondaryText,
              style: StrokeStyle(lineWidth: 7, lineCap: .round, lineJoin: .round)
            )
          if index == completedStrokeCount, activeStrokeProgress > 0 {
            KanjiStrokeShape(stroke: stroke, viewportSize: diagram.viewportSize)
              .trim(from: 0, to: activeStrokeProgress)
              .stroke(
                ZenbuTheme.chrome,
                style: StrokeStyle(lineWidth: 7, lineCap: .round, lineJoin: .round)
              )
          }
        }

        if completedStrokeCount < diagram.strokes.count,
          activeStrokeProgress == 0,
          let start = diagram.strokes[completedStrokeCount].startPoint
        {
          Circle()
            .fill(ZenbuTheme.chrome)
            .frame(width: 14, height: 14)
            .position(
              x: geometry.size.width * CGFloat(start.x / diagram.viewportSize),
              y: geometry.size.height * CGFloat(start.y / diagram.viewportSize)
            )
        }
      }
      .clipShape(Rectangle())
    }
  }
}

private struct StrokeGridLines: Shape {
  func path(in rect: CGRect) -> Path {
    var path = Path()
    path.addRect(rect.insetBy(dx: 1, dy: 1))
    path.move(to: CGPoint(x: rect.midX, y: rect.minY))
    path.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
    path.move(to: CGPoint(x: rect.minX, y: rect.midY))
    path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
    return path
  }
}

private struct KanjiStrokeShape: Shape {
  let stroke: KanjiStroke
  let viewportSize: Double

  func path(in rect: CGRect) -> Path {
    var path = Path()
    let scaleX = rect.width / CGFloat(viewportSize)
    let scaleY = rect.height / CGFloat(viewportSize)
    func point(_ value: KanjiStrokePoint) -> CGPoint {
      CGPoint(x: CGFloat(value.x) * scaleX, y: CGFloat(value.y) * scaleY)
    }
    for command in stroke.commands {
      switch command {
      case .move(let destination):
        path.move(to: point(destination))
      case .cubic(let control1, let control2, let end):
        path.addCurve(
          to: point(end),
          control1: point(control1),
          control2: point(control2)
        )
      }
    }
    return path
  }
}

extension KanjiStroke {
  fileprivate var startPoint: KanjiStrokePoint? {
    guard let first = commands.first, case .move(let point) = first else { return nil }
    return point
  }
}
