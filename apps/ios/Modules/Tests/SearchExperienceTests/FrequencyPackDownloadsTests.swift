import Foundation
import Testing
@testable import SearchExperience

@MainActor
@Suite("Frequency dictionary downloads")
struct FrequencyPackDownloadsTests {
  private let anime = FrequencyPackID(rawValue: "zenbu.jiten.anime.ja.ordered-v2")
  private let manga = FrequencyPackID(rawValue: "zenbu.jiten.manga.ja.ordered-v2")

  @Test("a second download keeps the first one's progress, and each finishes on its own")
  func downloadsRunSideBySide() async {
    let downloads = FrequencyPackDownloads()
    let (animeFinish, finishAnime) = AsyncStream.makeStream(of: Void.self)
    let (mangaFinish, finishManga) = AsyncStream.makeStream(of: Void.self)
    downloads.start(anime) { progress in
      progress(0.4)
      for await _ in animeFinish {}
    }
    downloads.start(manga) { _ in
      for await _ in mangaFinish {}
    }
    await settle { downloads.fraction(for: anime) == 0.4 }
    #expect(downloads.fraction(for: anime) == 0.4)
    #expect(downloads.fraction(for: manga) == 0)

    finishAnime.finish()
    await settle { downloads.fraction(for: anime) == nil }
    #expect(downloads.fraction(for: anime) == nil)
    #expect(downloads.fraction(for: manga) == 0)

    finishManga.finish()
    await settle { downloads.fractions.isEmpty }
    #expect(downloads.fractions.isEmpty)
  }

  @Test("stopping a download clears its row at once, cancels it, and a new start isn't cleared by the old one")
  func stopCancels() async {
    let downloads = FrequencyPackDownloads()
    var wasCancelled = false
    let (release, releaseStopped) = AsyncStream.makeStream(of: Void.self)
    downloads.start(anime) { progress in
      for await _ in release {}
      wasCancelled = Task.isCancelled
      progress(0.9)
    }
    downloads.stop(anime)
    #expect(downloads.fraction(for: anime) == nil)

    let (finish, finishRestart) = AsyncStream.makeStream(of: Void.self)
    downloads.start(anime) { _ in
      for await _ in finish {}
    }
    releaseStopped.finish()
    await settle { wasCancelled }
    for _ in 0..<10 { await Task.yield() }
    #expect(wasCancelled)
    #expect(downloads.fraction(for: anime) == 0)

    finishRestart.finish()
    await settle { downloads.fraction(for: anime) == nil }
    #expect(downloads.fraction(for: anime) == nil)
  }

  @Test("tapping a pack that is already downloading doesn't start it again")
  func startsOnce() async {
    let downloads = FrequencyPackDownloads()
    var starts = 0
    let (finish, finishAll) = AsyncStream.makeStream(of: Void.self)
    for _ in 0..<2 {
      downloads.start(anime) { _ in
        starts += 1
        for await _ in finish {}
      }
    }
    await settle { starts > 0 }
    finishAll.finish()
    await settle { downloads.fractions.isEmpty }
    #expect(starts == 1)
  }

  @Test("progress only moves forward, stops at done, and ignores packs that aren't downloading")
  func progressMovesForward() {
    let downloads = FrequencyPackDownloads()
    downloads.start(anime) { _ in try await Task.sleep(for: .seconds(60)) }
    downloads.report(0.5, for: anime)
    downloads.report(0.3, for: anime)
    #expect(downloads.fraction(for: anime) == 0.5)
    downloads.report(2, for: anime)
    #expect(downloads.fraction(for: anime) == 1)
    downloads.report(0.5, for: manga)
    #expect(downloads.fraction(for: manga) == nil)
    downloads.stop(anime)
  }

  @Test(
    "a stopped download leaves no failure on its row, and any other failure shows one",
    arguments: [
      (CancellationError() as any Error, String?.none),
      (URLError(.cancelled), nil),
      (URLError(.notConnectedToInternet), "Download or validation failed. Try again."),
    ])
  func failureAfterDownload(error: any Error, failure: String?) async throws {
    let catalog = try FrequencyPackCatalog.bundled()
    let optional = try #require(catalog.packs.first { !$0.bundled })
    let manager = try FrequencyPackManager.bundled(
      catalog,
      storageDirectory: FileManager.default.temporaryDirectory
        .appending(path: "frequency-pack-failure-\(UUID().uuidString)"),
      download: { _, _ in throw error })
    await #expect(throws: (any Error).self) { try await manager.download(optional.packID) }
    let pack = try await manager.snapshot().packs.first { $0.id == optional.packID }
    #expect(pack?.failureMessage == failure)
  }

  @Test("a stop once the download is done waits for the install instead of clearing the row")
  func stopAfterDownloadIsIgnored() {
    let downloads = FrequencyPackDownloads()
    downloads.start(anime) { _ in try await Task.sleep(for: .seconds(60)) }
    downloads.report(1, for: anime)
    downloads.stop(anime)
    #expect(downloads.fraction(for: anime) == 1)
  }

  @Test("the download delegate reports rising whole percents that end at done")
  func delegateReportsProgress() async throws {
    let reports = ProgressReports()
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [ChunkedPackSource.self]
    let (data, _) = try await URLSession(configuration: configuration).data(
      from: try #require(URL(string: "https://fixture.invalid/pack")),
      delegate: FrequencyPackDownloadProgress { reports.append($0) })
    #expect(data == ChunkedPackSource.body)
    let values = reports.values
    #expect(values.count > 1)
    #expect(values == values.sorted())
    #expect(values.last == 1)
  }

  private func settle(_ isDone: () -> Bool) async {
    for _ in 0..<1_000 where !isDone() {
      await Task.yield()
    }
  }
}

private final class ProgressReports: @unchecked Sendable {
  private let lock = NSLock()
  private var reported: [Double] = []

  var values: [Double] { lock.withLock { reported } }

  func append(_ value: Double) {
    lock.withLock { reported.append(value) }
  }
}

private final class ChunkedPackSource: URLProtocol, @unchecked Sendable {
  static let body = Data(repeating: 7, count: 400_000)

  override class func canInit(with request: URLRequest) -> Bool { true }

  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    guard let url = request.url,
      let response = HTTPURLResponse(
        url: url, statusCode: 200, httpVersion: "HTTP/1.1",
        headerFields: ["Content-Length": String(Self.body.count)])
    else { return }
    client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
    let chunk = Self.body.count / 4
    for start in stride(from: 0, to: Self.body.count, by: chunk) {
      client?.urlProtocol(self, didLoad: Self.body[start..<min(start + chunk, Self.body.count)])
    }
    client?.urlProtocolDidFinishLoading(self)
  }

  override func stopLoading() {}
}
