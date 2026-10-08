import Foundation
import Testing

@testable import SearchExperience

private func videoID(_ number: Int) -> String {
  "video" + String(format: "%06d", number)
}

private func iso(_ date: Date) -> String {
  Date.ISO8601FormatStyle(includingFractionalSeconds: true).format(date)
}

@MainActor
@Suite("Account sync: watch history")
struct AccountSyncWatchHistoryTests {
  private typealias Fixture = AccountFixture
  private let ramen = "ramenVideo1"
  private let sushi = "sushiVideo2"

  @Test("the first sync uploads Recent at version 0, oldest first, with when each was watched")
  func firstSyncUploadsRecent() async throws {
    let fixture = Fixture()
    fixture.serve()
    await fixture.launch()
    fixture.watch(ramen, position: 75.5)
    fixture.now += 60
    fixture.watch(sushi, title: "寿司")

    try await fixture.signIn()

    let sent = try #require(fixture.server.requests(to: "POST /v1/sync").first?.sync)
    let watches = sent.mutations.filter { $0.entity == SyncEntity.watchedVideo }
    #expect(watches.map(\.entityId) == [ramen, sushi])
    #expect(watches.allSatisfy { $0.operation == "watch" && $0.baseVersion == 0 })
    #expect(
      watches[0].fields == [
        "watchedAt": .string(iso(fixture.now - 60)), "title": .string("日本の朝ごはん"),
        "position": .decimal(75.5),
      ])
    #expect(fixture.sync.state.queue.isEmpty)
  }

  @Test("watching queues the whole video, and a newer watch replaces one not yet sent")
  func newerWatchReplacesUnsent() async throws {
    let fixture = try await Fixture.afterSignIn()
    fixture.server.respond { _ in .offline }
    fixture.watch(ramen)
    fixture.watch(ramen, position: 10)
    fixture.watch(ramen, position: 20)
    fixture.watch(sushi)

    #expect(
      fixture.queuedOperations == [
        "watchedVideo watch \(ramen)", "watchedVideo watch \(ramen)", "watchedVideo watch \(sushi)",
      ])
    #expect(fixture.sync.state.queue[1].fields?["position"] == .decimal(20))

    fixture.serve()
    try await fixture.syncNow()
    let sent = fixture.server.requests(to: "POST /v1/sync").dropFirst().map(\.sync.mutations)
    #expect(sent.map { $0.map(\.entityId) } == [[ramen], [ramen, sushi]])
    #expect(fixture.sync.state.queue.isEmpty)
  }

  @Test("videos watched elsewhere join Recent by when they were watched, keeping the newest 50")
  func pulledVideosKeepTheNewest() async throws {
    let fixture = try await Fixture.afterSignIn()
    fixture.watch(ramen)
    let start = fixture.now
    fixture.serve { request in
      let pulled = (1...50).map { number in
        StubSync.watchedVideo(
          videoID(number), at: iso(start + Double(number - 25)), version: 1, title: "#\(number)")
      }
      return StubSync.answer(results: StubSync.applied(request), changes: pulled, cursor: "c2")
    }
    try await fixture.syncNow()

    let recent = fixture.watchHistory.videos.map(\.videoID)
    #expect(recent.count == 50)
    #expect(recent.first == videoID(50))
    #expect(recent.contains(ramen))
    #expect(!recent.contains(videoID(1)))
    #expect(fixture.watchHistory.videos.first?.position == 42.5)
    #expect(fixture.queuedOperations.isEmpty)
  }

  @Test("a video removed or pruned elsewhere leaves Recent; one removed here sends a remove")
  func removals() async throws {
    let fixture = try await Fixture.afterSignIn()
    fixture.watch(ramen)
    fixture.watch(sushi)
    try await fixture.syncNow()
    fixture.serve { request in
      StubSync.answer(
        results: StubSync.applied(request, version: 2),
        changes: [StubSync.gone("watchedVideo", ramen, version: 2)], cursor: "c2")
    }
    try await fixture.syncNow()
    #expect(fixture.watchHistory.videos.map(\.videoID) == [sushi])

    let shown = try #require(fixture.watchHistory.videos.first)
    fixture.server.respond { _ in .offline }
    fixture.watchHistory.remove(shown)
    #expect(fixture.queuedOperations == ["watchedVideo remove \(sushi)"])
    #expect(fixture.sync.state.queue.first?.baseVersion == 1)
  }

  @Test("Recent past 50 drops its oldest on the phone without sending a remove")
  func capSendsNoRemove() async throws {
    let fixture = try await Fixture.afterSignIn()
    fixture.server.respond { _ in .offline }
    for number in 1...51 {
      fixture.now += 1
      fixture.watch(videoID(number))
    }
    #expect(fixture.watchHistory.videos.count == 50)
    #expect(!fixture.watchHistory.videos.contains { $0.videoID == videoID(1) })
    #expect(!fixture.queuedOperations.contains { $0.contains("remove") })
  }

  @Test("a watch that lost to a removal elsewhere takes the video out of Recent")
  func watchLosesToRemoval() async throws {
    let fixture = try await Fixture.afterSignIn()
    fixture.watch(ramen)
    try await fixture.syncNow()
    fixture.watch(ramen, position: 300)
    fixture.serve { request in
      StubSync.answer(
        results: request.mutations.map {
          StubSync.conflict($0.id, StubSync.gone("watchedVideo", ramen, version: 2))
        }, cursor: "c2")
    }
    try await fixture.syncNow()
    #expect(fixture.watchHistory.videos.isEmpty)
    #expect(fixture.sync.state.versions["watchedVideo:\(ramen)"] == 2)

    fixture.watch(ramen)
    #expect(fixture.sync.state.queue.last?.baseVersion == 2)
  }

  @Test("a rejected watch of a new video is taken back out, and of a known one is undone")
  func rejectedWatch() async throws {
    let fixture = try await Fixture.afterSignIn()
    let rejectAll: @Sendable (StubSyncRequest) -> StubReply = { request in
      StubSync.answer(
        results: request.mutations.map { StubSync.rejected($0.id, "invalid_fields") },
        cursor: "c2")
    }
    fixture.serve(sync: rejectAll)
    fixture.watch(ramen)
    try await fixture.syncNow()
    #expect(fixture.watchHistory.videos.isEmpty)

    fixture.serve()
    fixture.watch(sushi, position: 5)
    try await fixture.syncNow()
    fixture.serve(sync: rejectAll)
    fixture.watch(sushi, position: 99)
    try await fixture.syncNow()
    #expect(fixture.watchHistory.videos.map(\.position) == [5])
  }

  @Test("a phone that synced before watch history did uploads Recent once, from no cursor")
  func catchesUpOnWatchHistory() async throws {
    let ramen = ramen
    let (fixture, caughtUp) = try await Fixture.caughtUp(from: nil) { $0.watch(ramen) }
    #expect(caughtUp.cursor == nil)
    #expect(caughtUp.mutations.map { "\($0.entity) \($0.operation)" } == ["watchedVideo watch"])
    #expect(fixture.sync.state.syncedEntities == SyncEntity.uploaded)

    try await fixture.syncNow()
    #expect(fixture.server.requests(to: "POST /v1/sync").last?.sync.cursor == "cursor-1")
  }

  @Test("a watch the service doesn't know yet stays on the phone, and goes again after a relaunch")
  func olderServiceKeepsTheWatch() async throws {
    let fixture = try await Fixture.afterSignIn()
    fixture.serve { request in
      StubSync.answer(
        results: request.mutations.map { StubSync.rejected($0.id, "unknown_entity") }, cursor: "c2")
    }
    fixture.watch(ramen)
    try await fixture.syncNow()
    #expect(fixture.watchHistory.videos.map(\.videoID) == [ramen])
    #expect(!fixture.sync.state.syncedEntities.contains(SyncEntity.watchedVideo))
    try await fixture.syncNow()
    #expect(fixture.server.requests(to: "POST /v1/sync").last?.sync.mutations.isEmpty == true)

    fixture.serve()
    await fixture.launch()
    try await fixture.syncNow()
    let caughtUp = try #require(fixture.server.requests(to: "POST /v1/sync").last?.sync)
    #expect(caughtUp.cursor == nil)
    #expect(caughtUp.mutations.map(\.entityId) == [ramen])
    #expect(fixture.sync.state.syncedEntities == SyncEntity.uploaded)
  }

  @Test("a watch on one phone and a removal on another reach both")
  func twoPhones() async throws {
    let (service, phone, pad) = await Fixture.twoPhones()
    phone.watch(ramen, position: 30)
    try await phone.signIn()
    try await pad.signIn()
    #expect(pad.watchHistory.videos.map(\.position) == [30])

    let shown = try #require(pad.watchHistory.videos.first)
    pad.watchHistory.remove(shown)
    try await pad.syncNow()
    try await phone.syncNow()

    #expect(phone.watchHistory.videos.isEmpty)
    #expect(service.liveKeys(for: Fixture.email, entity: "watchedVideo").isEmpty)
  }

  @Test("videos saved before Recent kept a time are dated in their order, before any watched since")
  func datesOldVideos() throws {
    let suite = "watch-history-\(UUID().uuidString)"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { UserDefaults().removePersistentDomain(forName: suite) }
    let old = [WatchedVideo(videoID: ramen), WatchedVideo(videoID: sushi)]
    defaults.set(try JSONEncoder().encode(old), forKey: "watch.recent-videos.v1")
    let start = WatchHistory.undatedStart

    let history = WatchHistory(defaults: defaults, now: { Date(timeIntervalSince1970: 1_800_000_000) })
    #expect(history.videos.map(\.watchedAt) == [start + 2, start + 1])
    history.record(try #require(YouTubeVideoID(rawValue: videoID(1))))
    #expect(history.videos.map(\.videoID) == [videoID(1), ramen, sushi])
    let reloaded = WatchHistory(defaults: defaults)
    #expect(reloaded.videos.map(\.watchedAt).suffix(2) == [start + 2, start + 1])
  }

  @Test("the phone keeps the versions of the latest 100 videos gone from the account, and no more")
  func boundsGoneVersions() async throws {
    let fixture = try await Fixture.afterSignIn()
    fixture.serve { _ in
      StubSync.answer(
        changes: (1...101).map { StubSync.gone("watchedVideo", videoID($0), version: 2) },
        cursor: "c2")
    }
    try await fixture.syncNow()
    let kept = fixture.sync.state.versions.keys.filter { $0.hasPrefix("watchedVideo:") }
    #expect(kept.count == 100)
    #expect(!kept.contains("watchedVideo:\(videoID(1))"))
    #expect(kept.contains("watchedVideo:\(videoID(101))"))
  }

  @Test("a pulled video whose ID isn't a YouTube video ID is left out")
  func refusesBadVideoIDs() async throws {
    let fixture = try await Fixture.afterSignIn()
    fixture.serve { _ in
      StubSync.answer(
        changes: [
          StubSync.watchedVideo("not a video", at: iso(Date()), version: 1),
          StubSync.put(
            "watchedVideo", ramen, 1,
            ["videoId": sushi, "title": NSNull(), "author": NSNull(), "duration": NSNull(),
             "position": NSNull(), "comprehension": NSNull(), "watchedAt": iso(Date())]),
        ], cursor: "c2")
    }
    try await fixture.syncNow()
    #expect(fixture.watchHistory.videos.isEmpty)
  }
}
