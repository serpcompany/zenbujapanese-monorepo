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
    Text(
      "\(WatchSessionView.timestamp(scrubPosition ?? player.currentTime)) / \(WatchSessionView.timestamp(player.duration))"
    )
  }
}

struct LiveCaptionList<Row: View>: View {
  let cues: [SubtitleCue]
  let player: YouTubePlayerController
  @ViewBuilder let row: (SubtitleCue) -> Row

  var body: some View {
    let activeCueID = (cues.last { $0.start <= player.currentTime } ?? cues.first)?.id
    ScrollViewReader { proxy in
      List {
        ForEach(cues) { cue in
          row(cue)
            .captionCardRow(isActive: cue.id == activeCueID)
            .id(cue.id)
        }
      }
      .listStyle(.plain)
      .contentMargins(.top, 8, for: .scrollContent)
      .onChange(of: activeCueID) { _, id in
        guard let id else { return }
        withAnimation { proxy.scrollTo(id, anchor: .center) }
      }
      .accessibilityIdentifier("watch.captions")
    }
  }
}
