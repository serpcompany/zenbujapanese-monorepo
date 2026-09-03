import CryptoKit
import Sudachi
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

private final class ConcurrentResults: @unchecked Sendable {
  private let lock = NSLock()
  private var values: [String] = []
  private var failures = 0

  func append(_ value: String) { lock.withLock { values.append(value) } }
  func fail() { lock.withLock { failures += 1 } }
  func snapshot() -> ([String], Int) { lock.withLock { (values, failures) } }
}

private func tokenJSON(_ morphemes: [Morpheme]) throws -> String {
  let objects: [[String: Any]] = morphemes.map {
    [
      "surface": $0.surface,
      "begin": $0.begin,
      "end": $0.end,
      "dictionary_form": $0.dictionaryForm,
      "normalized_form": $0.normalizedForm,
      "reading": $0.readingForm,
      "pos": $0.partOfSpeech,
      "is_oov": $0.isOov,
    ]
  }
  let data = try JSONSerialization.data(withJSONObject: objects, options: [.sortedKeys])
  return String(data: data, encoding: .utf8)!
}

private func execute() throws -> [String: Any] {
  let initialRSS = residentBytes()
  let dictionaryURL = Bundle.main.url(forResource: "system_core", withExtension: "dic")!
  let dictionaryStart = ContinuousClock.now
  let dictionary = try SudachiDictionary(systemDictionary: dictionaryURL)
  let dictionaryMS = Double(dictionaryStart.duration(to: .now).components.attoseconds) / 1.0e15

  let tokenizerStart = ContinuousClock.now
  let tokenizer = try SudachiTokenizer(dictionary: dictionary, mode: .c)
  let tokenizerMS = Double(tokenizerStart.duration(to: .now).components.attoseconds) / 1.0e15

  let sentences = [
    "今日は良い天気ですね。",
    "毎日勉強しても上手にならない。",
    "キャリアセンス多重アクセス衝突検出方式を用いる。",
    "解いてから話します。",
  ]
  var durations: [Double] = []
  var outputs: [String] = []
  for index in 0..<120 {
    let text = sentences[index % sentences.count]
    let start = ContinuousClock.now
    let morphemes = try tokenizer.tokenize(text: text)
    durations.append(Double(start.duration(to: .now).components.attoseconds) / 1.0e15)
    if index < sentences.count { outputs.append(try tokenJSON(morphemes)) }
  }
  let determinismText = "今日は用いる解いて話します。"
  let deterministic = try (0..<10).map { _ in
    try tokenJSON(tokenizer.tokenize(text: determinismText))
  }
  let hashes = Set(
    deterministic.map {
      SHA256.hash(data: Data($0.utf8)).map { String(format: "%02x", $0) }.joined()
    })
  let concurrentResults = ConcurrentResults()
  let concurrentStart = ContinuousClock.now
  DispatchQueue.concurrentPerform(iterations: 100) { _ in
    do { concurrentResults.append(try tokenJSON(tokenizer.tokenize(text: determinismText))) } catch
    { concurrentResults.fail() }
  }
  let concurrentMS = Double(concurrentStart.duration(to: .now).components.attoseconds) / 1.0e15
  let (concurrentOutputs, concurrentFailures) = concurrentResults.snapshot()
  let concurrentHashes = Set(
    concurrentOutputs.map {
      SHA256.hash(data: Data($0.utf8)).map { String(format: "%02x", $0) }.joined()
    })

  return [
    "adapter": "sudachi-swift 0.1.1 prebuilt XCFramework + SudachiDict Core",
    "engine": "sudachi.rs 0.6.11",
    "dictionary": "SudachiDict Core 20260723",
    "dictionary_init_ms": dictionaryMS,
    "tokenizer_init_ms": tokenizerMS,
    "warm_p50_ms": percentile(Array(durations.dropFirst(20)), 0.50),
    "warm_p95_ms": percentile(Array(durations.dropFirst(20)), 0.95),
    "warm_mean_ms": Array(durations.dropFirst(20)).reduce(0, +) / 100.0,
    "initial_rss_bytes": initialRSS,
    "steady_rss_bytes": residentBytes(),
    "deterministic_hash_count": hashes.count,
    "deterministic_hash": hashes.first ?? "",
    "concurrent_100_ms": concurrentMS,
    "concurrent_result_count": concurrentOutputs.count,
    "concurrent_failure_count": concurrentFailures,
    "concurrent_hash_count": concurrentHashes.count,
    "sample_outputs": outputs,
  ]
}

@main
struct Issue251SudachiApp: App {
  @State private var status = "Running Sudachi iOS benchmark…"

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
