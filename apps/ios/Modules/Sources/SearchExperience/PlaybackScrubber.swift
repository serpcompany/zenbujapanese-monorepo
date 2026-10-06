import SwiftUI

struct PlaybackScrubber: View {
  let position: TimeInterval
  let duration: TimeInterval
  let scrub: (TimeInterval) -> Void
  let commit: (TimeInterval) -> Void
  @GestureState private var isDragging = false

  var body: some View {
    GeometryReader { geometry in
      let fraction = duration > 0 ? min(max(position / duration, 0), 1) : 0
      let knob: CGFloat = isDragging ? 16 : 10
      ZStack(alignment: .leading) {
        Capsule().fill(.quaternary).frame(height: 4)
        Capsule().fill(.primary).frame(width: geometry.size.width * fraction, height: 4)
        Circle()
          .fill(.primary)
          .frame(width: knob, height: knob)
          .offset(x: geometry.size.width * fraction - knob / 2)
      }
      .frame(maxHeight: .infinity)
      .contentShape(.rect)
      .gesture(
        DragGesture(minimumDistance: 0)
          .updating($isDragging) { _, state, _ in state = true }
          .onChanged { value in scrub(time(at: value.location.x, width: geometry.size.width)) }
          .onEnded { value in commit(time(at: value.location.x, width: geometry.size.width)) }
      )
      .animation(.easeOut(duration: 0.15), value: isDragging)
    }
    .frame(height: 18)
    .accessibilityElement()
    .accessibilityLabel("Playback position")
    .accessibilityValue(WatchSessionView.timestamp(position))
    .accessibilityAdjustableAction { direction in
      let step: TimeInterval = direction == .increment ? 10 : -10
      commit(min(max(position + step, 0), duration))
    }
    .accessibilityIdentifier("watch.scrubber")
  }

  private func time(at x: CGFloat, width: CGFloat) -> TimeInterval {
    guard width > 0 else { return 0 }
    return duration * Double(min(max(x / width, 0), 1))
  }
}
