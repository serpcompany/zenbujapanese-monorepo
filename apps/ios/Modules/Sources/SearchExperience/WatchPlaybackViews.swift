import SwiftUI

struct PlaybackPositionScrubber: View {
  let player: YouTubePlayerController
  @Binding var scrubPosition: TimeInterval?
  let commit: (TimeInterval) -> Void

  var body: some View {
    PlaybackScrubber(
      position: scrubPosition ?? player.currentTime,
      duration: player.duration,
      scrub: { scrubPosition = $0 },
      commit: commit
    )
  }
}

struct PlaybackTimeText: View {
  let player: YouTubePlayerController
  let scrubPosition: TimeInterval?

  var body: some View {
    let shown =
      "\(WatchSessionView.timestamp(scrubPosition ?? player.currentTime)) / \(WatchSessionView.timestamp(player.duration))"
    Text(shown)
      .accessibilityHidden(true)
      .showingUITests(shown, as: "watch.time")
  }
}

struct LiveCaptionList<Row: View>: View {
  let cues: [SubtitleCue]
  let linksMore: Bool
  let player: YouTubePlayerController
  @ViewBuilder let row: (SubtitleCue) -> Row
  @State private var activeCueID: Int?
  @State private var draws = DrawCount()

  var body: some View {
    ScrollViewReader { proxy in
      List {
        ForEach(cues) { cue in
          row(cue)
            .captionCardRow(isActive: cue.id == activeCueID)
            .id(cue.id)
        }
        if linksMore {
          ProgressView()
            .frame(maxWidth: .infinity)
            .listRowSeparator(.hidden)
            .accessibilityIdentifier("watch.captions-linking")
        }
      }
      .listStyle(.plain)
      .contentMargins(.top, 8, for: .scrollContent)
      .background { ActiveCueFollower(cues: cues, player: player, activeCueID: $activeCueID) }
      .onChange(of: activeCueID) { previous, id in
        guard previous != nil, let id else { return }
        withAnimation { proxy.scrollTo(id, anchor: .center) }
      }
      .accessibilityIdentifier("watch.captions")
    }
    .countingDraws(as: "watch.captions.draws", in: draws)
  }
}

private struct ActiveCueFollower: View {
  let cues: [SubtitleCue]
  let player: YouTubePlayerController
  @Binding var activeCueID: Int?

  var body: some View {
    let id = (cues.last { $0.start <= player.currentTime } ?? cues.first)?.id
    Color.clear
      .onChange(of: id, initial: true) { _, id in
        if activeCueID != id { activeCueID = id }
      }
  }
}
