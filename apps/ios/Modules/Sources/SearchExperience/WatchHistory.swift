import Foundation
import Observation

struct WatchedVideo: Codable, Hashable, Identifiable, Sendable {
  let videoID: String
  var title: String?
  var comprehension: Double?
  var author: String?
  var duration: TimeInterval?
  var position: TimeInterval?
  var watchedAt: Date?

  var progress: Double? {
    guard let duration, duration > 0, let position else { return nil }
    return min(max(position / duration, 0), 1)
  }

  var id: String { videoID }
  var thumbnailURL: URL? { URL(string: "https://i.ytimg.com/vi/\(videoID)/mqdefault.jpg") }

  func isNewer(than other: WatchedVideo) -> Bool {
    let time = watchedAt ?? .distantPast
    let otherTime = other.watchedAt ?? .distantPast
    return time == otherTime ? videoID > other.videoID : time > otherTime
  }
}

@MainActor
@Observable
final class WatchHistory {
  static let shared = WatchHistory()
  static let kept = 50

  private(set) var videos: [WatchedVideo]
  @ObservationIgnored var changeObserver: ((SavedItemChange) -> Void)?
  @ObservationIgnored private let defaults: UserDefaults
  @ObservationIgnored private let now: @MainActor () -> Date
  private static let storageKey = "watch.recent-videos.v1"

  init(defaults: UserDefaults = .standard, now: @escaping @MainActor () -> Date = Date.init) {
    self.defaults = defaults
    self.now = now
    let stored =
      defaults.data(forKey: Self.storageKey)
      .flatMap { try? JSONDecoder().decode([WatchedVideo].self, from: $0) } ?? []
    let loadedAt = now()
    videos = stored.enumerated().map { index, video in
      var dated = video
      dated.watchedAt = video.watchedAt ?? loadedAt.addingTimeInterval(-Double(index))
      return dated
    }
    if stored.contains(where: { $0.watchedAt == nil }) { save() }
  }

  func record(_ videoID: YouTubeVideoID, update: (inout WatchedVideo) -> Void = { _ in }) {
    let previous = videos.first { $0.videoID == videoID.rawValue }
    var video = previous ?? WatchedVideo(videoID: videoID.rawValue)
    update(&video)
    video.watchedAt = now()
    place(video)
    changeObserver?(.videoWatched(video, previous: previous))
  }

  func remove(_ video: WatchedVideo) {
    guard let removed = videos.first(where: { $0.videoID == video.videoID }) else { return }
    videos.removeAll { $0.videoID == video.videoID }
    save()
    changeObserver?(.videoRemoved(removed))
  }

  func applySynced(_ video: WatchedVideo) {
    place(video)
  }

  func applySyncedRemoval(of videoID: String) {
    guard videos.contains(where: { $0.videoID == videoID }) else { return }
    videos.removeAll { $0.videoID == videoID }
    save()
  }

  private func place(_ video: WatchedVideo) {
    var placed = videos.filter { $0.videoID != video.videoID }
    placed.append(video)
    videos = Array(placed.sorted { $0.isNewer(than: $1) }.prefix(Self.kept))
    save()
  }

  private func save() {
    defaults.set(try? JSONEncoder().encode(videos), forKey: Self.storageKey)
  }
}
