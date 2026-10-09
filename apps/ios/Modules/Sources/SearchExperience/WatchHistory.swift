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

  var withFiniteNumbers: WatchedVideo {
    var video = self
    video.comprehension = comprehension.flatMap { $0.isFinite ? $0 : nil }
    video.duration = duration.flatMap { $0.isFinite ? $0 : nil }
    video.position = position.flatMap { $0.isFinite ? $0 : nil }
    return video
  }
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
  static let undatedStart = Date(timeIntervalSince1970: 946_684_800)

  private(set) var videos: [WatchedVideo]
  @ObservationIgnored var changeObserver: ((SavedItemChange) -> Void)?
  @ObservationIgnored private let defaults: UserDefaults
  @ObservationIgnored private let now: @MainActor () -> Date
  private static let storageKey = "watch.recent-videos.v1"

  init(defaults: UserDefaults = .standard, now: @escaping @MainActor () -> Date = Date.init) {
    self.defaults = defaults
    self.now = now
    let (stored, lostSome) = Self.readable(in: defaults)
    videos = stored.enumerated().map { index, video in
      var dated = video
      dated.watchedAt =
        video.watchedAt ?? Self.undatedStart.addingTimeInterval(Double(stored.count - index))
      return dated
    }
    if lostSome || stored.contains(where: { $0.watchedAt == nil }) { save() }
  }

  private static func readable(in defaults: UserDefaults) -> ([WatchedVideo], lostSome: Bool) {
    guard let data = defaults.data(forKey: storageKey) else { return ([], false) }
    let stored = try? JSONDecoder().decode([LossyDecodable<WatchedVideo>].self, from: data)
    let videos = stored?.compactMap(\.value) ?? []
    guard videos.count != stored?.count else { return (videos, false) }
    UnreadableCopy.keep(storageKey, in: defaults)
    return (videos, true)
  }

  func record(_ videoID: YouTubeVideoID, update: (inout WatchedVideo) -> Void = { _ in }) {
    let previous = videos.first { $0.videoID == videoID.rawValue }
    var video = previous ?? WatchedVideo(videoID: videoID.rawValue)
    update(&video)
    video = video.withFiniteNumbers
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
    guard let data = try? JSONEncoder().encode(videos) else { return }
    defaults.set(data, forKey: Self.storageKey)
  }
}
