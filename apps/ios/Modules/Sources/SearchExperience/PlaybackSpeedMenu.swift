import SwiftUI

struct PlaybackSpeedMenu: View {
  let player: YouTubePlayerController
  @State private var draws = DrawCount()

  var body: some View {
    Menu {
      Picker(
        "Playback Speed",
        selection: Binding(get: { player.playbackRate }, set: { player.setPlaybackRate($0) })
      ) {
        ForEach(Self.rates, id: \.self) { rate in
          Text(Self.label(rate)).tag(rate)
        }
      }
      .listedInItsMenu()
    } label: {
      Text(Self.label(player.playbackRate))
        .font(.footnote.weight(.semibold).monospacedDigit())
        .frame(minWidth: 44, minHeight: 44)
    }
    .accessibilityLabel("Playback speed, \(Self.label(player.playbackRate))")
    .accessibilityIdentifier("watch.speed")
    .countingDraws(as: "watch.speed.draws", in: draws)
  }

  private static let rates: [Double] = [0.5, 0.75, 1, 1.25, 1.5]

  private static func label(_ rate: Double) -> String {
    rate.formatted(.number.precision(.fractionLength(0...2))) + "×"
  }
}
