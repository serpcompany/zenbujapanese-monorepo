import Foundation
import Observation

struct WatchedVideo: Codable, Hashable, Identifiable {
  let videoID: String
  var title: String?
  var comprehension: Double?
  var author: String?
  var duration: TimeInterval?
  var position: TimeInterval?

  var progress: Double? {
    guard let duration, duration > 0, let position else { return nil }
    return min(max(position / duration, 0), 1)
  }

  var id: String { videoID }
  var thumbnailURL: URL? { URL(string: "https://i.ytimg.com/vi/\(videoID)/mqdefault.jpg") }
}

@MainActor
@Observable
final class WatchHistory {
  private(set) var videos: [WatchedVideo]
  @ObservationIgnored private let defaults: UserDefaults
  private static let storageKey = "watch.recent-videos.v1"

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    videos =
      defaults.data(forKey: Self.storageKey)
      .flatMap { try? JSONDecoder().decode([WatchedVideo].self, from: $0) } ?? []
  }

  func record(_ videoID: YouTubeVideoID, update: (inout WatchedVideo) -> Void = { _ in }) {
    var video =
      videos.first { $0.videoID == videoID.rawValue } ?? WatchedVideo(videoID: videoID.rawValue)
    update(&video)
    videos.removeAll { $0.videoID == videoID.rawValue }
    videos.insert(video, at: 0)
    videos = Array(videos.prefix(50))
    save()
  }

  func remove(_ video: WatchedVideo) {
    videos.removeAll { $0 == video }
    save()
  }

  private func save() {
    defaults.set(try? JSONEncoder().encode(videos), forKey: Self.storageKey)
  }
}
