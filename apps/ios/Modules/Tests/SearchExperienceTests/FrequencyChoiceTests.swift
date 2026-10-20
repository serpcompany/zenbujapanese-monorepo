import Foundation
import Testing

@testable import SearchExperience

@MainActor
@Suite("Frequency dictionaries chosen on another device")
struct FrequencyChoiceTests {
  @Test("a quiet download asks for no cellular data and nothing in Low Data Mode")
  func quietRequest() throws {
    let url = try #require(URL(string: "https://downloads.zenbujapanese.com/pack.json.zip"))
    let request = FrequencyChoice.quietRequest(for: url)
    #expect(request.url == url)
    #expect(!request.allowsExpensiveNetworkAccess)
    #expect(!request.allowsConstrainedNetworkAccess)
  }

  @Test("a pack chosen elsewhere downloads through the shared registry, so Frequency Dictionaries shows it and a second start is the same download")
  func sharedRegistry() async throws {
    let storage = FileManager.default.temporaryDirectory
      .appending(path: "frequency-choice-\(UUID().uuidString)", directoryHint: .isDirectory)
    defer { try? FileManager.default.removeItem(at: storage) }
    let catalog = try FrequencyPackCatalog.bundled()
    let pack = try #require(catalog.packs.first { !$0.bundled }).packID
    let calls = QuietCalls()
    let (held, letGo) = AsyncStream.makeStream(of: Void.self)
    let manager = try FrequencyPackManager.bundled(
      catalog, storageDirectory: storage, download: { _, _ in throw FrequencyPackError.invalidSource },
      quietDownload: { _, _ in
        calls.add()
        for await _ in held {}
        throw URLError(.notConnectedToInternet)
      })

    FrequencyChoice.downloadQuietly([pack], with: manager)
    FrequencyChoice.downloadQuietly([pack], with: manager)
    #expect(FrequencyPackDownloads.shared.fraction(for: pack) == 0)
    while calls.count == 0 { await Task.yield() }
    letGo.finish()
    while FrequencyPackDownloads.shared.fraction(for: pack) != nil { await Task.yield() }

    #expect(calls.count == 1)
    #expect(try await manager.snapshot().packs.first { $0.id == pack }?.failureMessage == nil)
  }
}

final class QuietCalls: @unchecked Sendable {
  private let lock = NSLock()
  private var calls = 0

  var count: Int { lock.withLock { calls } }

  func add() { lock.withLock { calls += 1 } }
}
