import SwiftUI

struct PlayerMoreMenu: View {
  let videoID: YouTubeVideoID

  var body: some View {
    Menu("More", systemImage: "ellipsis") {
      ReadingAidShowSection()
      Section {
        ShareLink(item: URL(string: "https://youtu.be/\(videoID.rawValue)")!) {
          Label("Share Video", systemImage: "square.and.arrow.up")
        }
      }
    }
    .accessibilityIdentifier("watch.more")
  }
}
