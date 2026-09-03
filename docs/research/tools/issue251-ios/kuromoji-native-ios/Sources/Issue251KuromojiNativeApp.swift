import CryptoKit
import KuromojiIPADIC
import SwiftUI

private func percentile(_ values: [Double], _ fraction: Double) -> Double {
  let sorted = values.sorted()
  guard !sorted.isEmpty else { return 0 }
  return sorted[min(Int((Double(sorted.count - 1) * fraction).rounded(.up)), sorted.count - 1)]
}

private func residentBytes() -> UInt64 {
  var info = mach_task_basic_info()
  var count = mach_msg_type_number_t(
    MemoryLayout<mach_task_basic_info_data_t>.size / MemoryLayout<natural_t>.size)
  let result = withUnsafeMutablePointer(to: &info) {
    $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
      task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), $0, &count)
    }
  }
  return result == KERN_SUCCESS ? UInt64(info.resident_size) : 0
}

private func tokenJSON(_ tokens: [IPADICToken]) throws -> String {
  let objects: [[String: Any]] = tokens.map {
    [
      "surface": $0.surface,
      "begin_utf16": $0.position,
      "end_utf16": $0.position + ($0.surface as NSString).length,
      "dictionary_form": $0.baseForm,
      "reading": $0.reading,
      "pos": [
        $0.partOfSpeechLevel1, $0.partOfSpeechLevel2, $0.partOfSpeechLevel3, $0.partOfSpeechLevel4,
      ],
      "is_known": $0.isKnown,
    ]
  }
  let data = try JSONSerialization.data(withJSONObject: objects, options: [.sortedKeys])
  return String(data: data, encoding: .utf8)!
}

private final class ConcurrentResults: @unchecked Sendable {
  private let lock = NSLock()
  private var values: [String] = []
  func append(_ value: String) { lock.withLock { values.append(value) } }
  func snapshot() -> [String] { lock.withLock { values } }
}

private func execute() throws -> [String: Any] {
  let initialRSS = residentBytes()
  let tokenizerStart = ContinuousClock.now
  let tokenizer = try IPADICTokenizer()
  let tokenizerMS = Double(tokenizerStart.duration(to: .now).components.attoseconds) / 1.0e15

  let sentences = [
    "今日は良い天気ですね。",
    "毎日勉強しても上手にならない。",
    "キャリアセンス多重アクセス衝突検出方式を用いる。",
    "解いてから話します。",
  ]
  var durations: [Double] = []
  var outputs: [String] = []
  for index in 0..<220 {
    let text = sentences[index % sentences.count]
    let start = ContinuousClock.now
    let tokens = tokenizer.tokenize(text)
    durations.append(Double(start.duration(to: .now).components.attoseconds) / 1.0e15)
    if index < sentences.count { outputs.append(try tokenJSON(tokens)) }
  }
  let determinismText = "今日は用いる解いて話します。"
  let deterministic = try (0..<10).map { _ in try tokenJSON(tokenizer.tokenize(determinismText)) }
  let hashes = Set(
    deterministic.map {
      SHA256.hash(data: Data($0.utf8)).map { String(format: "%02x", $0) }.joined()
    })

  let concurrentResults = ConcurrentResults()
  let concurrentStart = ContinuousClock.now
  DispatchQueue.concurrentPerform(iterations: 100) { _ in
    concurrentResults.append((try? tokenJSON(tokenizer.tokenize(determinismText))) ?? "ERROR")
  }
  let concurrentMS = Double(concurrentStart.duration(to: .now).components.attoseconds) / 1.0e15
  let concurrentOutputs = concurrentResults.snapshot()
  let concurrentHashes = Set(
    concurrentOutputs.map {
      SHA256.hash(data: Data($0.utf8)).map { String(format: "%02x", $0) }.joined()
    })

  return [
    "adapter": "native Swift Kuromoji port + generated IPADIC bundle",
    "engine": "thuongvb/kuromoji-ios c601b3b",
    "dictionary": "mecab-ipadic-2.7.0-20070801",
    "tokenizer_init_ms": tokenizerMS,
    "warm_p50_ms": percentile(Array(durations.dropFirst(20)), 0.50),
    "warm_p95_ms": percentile(Array(durations.dropFirst(20)), 0.95),
    "warm_mean_ms": Array(durations.dropFirst(20)).reduce(0, +) / 200.0,
    "initial_rss_bytes": initialRSS,
    "steady_rss_bytes": residentBytes(),
    "deterministic_hash_count": hashes.count,
    "deterministic_hash": hashes.first ?? "",
    "concurrent_100_ms": concurrentMS,
    "concurrent_result_count": concurrentOutputs.count,
    "concurrent_hash_count": concurrentHashes.count,
    "sample_outputs": outputs,
  ]
}

@main
struct Issue251KuromojiNativeApp: App {
  @State private var status = "Running native Kuromoji iOS benchmark…"

  var body: some Scene {
    WindowGroup {
      Text(status).padding().task {
        do {
          let result = try execute()
          let data = try JSONSerialization.data(
            withJSONObject: result, options: [.prettyPrinted, .sortedKeys])
          let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("result.json")
          try data.write(to: url, options: .atomic)
          status = "Done"
          print("ISSUE251_RESULT \(String(data: data, encoding: .utf8)!)")
        } catch {
          status = "Failed: \(error.localizedDescription)"
          print("ISSUE251_ERROR \(error)")
        }
      }
    }
  }
}
