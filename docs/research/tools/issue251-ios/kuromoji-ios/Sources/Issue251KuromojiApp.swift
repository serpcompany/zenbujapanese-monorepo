import CryptoKit
import JavaScriptCore
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

private final class JSCFunctionBox: @unchecked Sendable {
  let function: JSValue
  init(_ function: JSValue) { self.function = function }
  func call(_ text: String) -> String { function.call(withArguments: [text])!.toString()! }
}

private final class ConcurrentResults: @unchecked Sendable {
  private let lock = NSLock()
  private var values: [String] = []
  func append(_ value: String) { lock.withLock { values.append(value) } }
  func snapshot() -> [String] { lock.withLock { values } }
}

private final class KuromojiRun: @unchecked Sendable {
  private let context = JSContext()!
  private var retainedBlocks: [AnyObject] = []

  func execute() throws -> [String: Any] {
    let initialRSS = residentBytes()
    var exceptionText: String?
    context.exceptionHandler = { _, exception in exceptionText = exception?.toString() }

    let loader: @convention(block) (String) -> JSValue = { [context] requestedPath in
      let requestedName = URL(fileURLWithPath: requestedPath).lastPathComponent
      let resourceName = requestedName.replacingOccurrences(of: ".gz", with: "")
      guard let resourceURL = Bundle.main.url(forResource: resourceName, withExtension: nil),
        let data = try? Data(contentsOf: resourceURL, options: .mappedIfSafe)
      else { fatalError("Missing dictionary resource: \(resourceName)") }
      let storage = UnsafeMutableRawPointer.allocate(byteCount: data.count, alignment: 16)
      data.copyBytes(to: storage.assumingMemoryBound(to: UInt8.self), count: data.count)
      var exception: JSValueRef?
      let arrayBuffer = JSObjectMakeArrayBufferWithBytesNoCopy(
        context.jsGlobalContextRef,
        storage,
        data.count,
        { bytes, _ in bytes?.deallocate() },
        nil,
        &exception
      )!
      return JSValue(jsValueRef: arrayBuffer, in: context)
    }
    retainedBlocks.append(loader as AnyObject)
    context.setObject(loader, forKeyedSubscript: "__loadKuromojiDictionary" as NSString)

    let bundleURL = Bundle.main.url(forResource: "kuromoji", withExtension: "js")!
    let source = try String(contentsOf: bundleURL, encoding: .utf8)
    let evalStart = ContinuousClock.now
    context.evaluateScript(source)
    let evalMS = Double(evalStart.duration(to: .now).components.attoseconds) / 1.0e15
    if let exceptionText {
      throw NSError(domain: "JSC", code: 1, userInfo: [NSLocalizedDescriptionKey: exceptionText])
    }

    let buildStart = ContinuousClock.now
    context.evaluateScript(
      """
          globalThis.__ready = false;
          globalThis.__buildError = null;
          globalThis.__tokenizer = null;
          kuromoji.builder({dicPath: "dict"}).build(function(err, tokenizer) {
            globalThis.__buildError = err ? String(err) : null;
            globalThis.__tokenizer = tokenizer;
            globalThis.__ready = true;
          });
      """)
    let deadline = Date().addingTimeInterval(30)
    while context.objectForKeyedSubscript("__ready")?.toBool() != true, Date() < deadline {
      RunLoop.current.run(until: Date().addingTimeInterval(0.001))
    }
    let buildMS = Double(buildStart.duration(to: .now).components.attoseconds) / 1.0e15
    if context.objectForKeyedSubscript("__ready")?.toBool() != true {
      throw NSError(
        domain: "JSC", code: 2, userInfo: [NSLocalizedDescriptionKey: "dictionary build timeout"])
    }
    if let error = context.objectForKeyedSubscript("__buildError"), !error.isNull,
      !error.isUndefined
    {
      throw NSError(
        domain: "JSC", code: 3,
        userInfo: [NSLocalizedDescriptionKey: error.toString() ?? "build failed"])
    }

    context.evaluateScript(
      """
          globalThis.__tokenizeJSON = function(text) {
            return JSON.stringify(globalThis.__tokenizer.tokenize(text));
          };
      """)
    let tokenize = context.objectForKeyedSubscript("__tokenizeJSON")!
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
      let result = tokenize.call(withArguments: [text])!.toString()!
      durations.append(Double(start.duration(to: .now).components.attoseconds) / 1.0e15)
      if index < sentences.count { outputs.append(result) }
    }
    let determinismText = "今日は用いる解いて話します。"
    let deterministic = (0..<10).map { _ in
      tokenize.call(withArguments: [determinismText])!.toString()!
    }
    let hashes = Set(
      deterministic.map {
        SHA256.hash(data: Data($0.utf8)).map { String(format: "%02x", $0) }.joined()
      })
    let functionBox = JSCFunctionBox(tokenize)
    let concurrentResults = ConcurrentResults()
    let concurrentStart = ContinuousClock.now
    DispatchQueue.concurrentPerform(iterations: 100) { _ in
      concurrentResults.append(functionBox.call(determinismText))
    }
    let concurrentMS = Double(concurrentStart.duration(to: .now).components.attoseconds) / 1.0e15
    let concurrentOutputs = concurrentResults.snapshot()
    let concurrentHashes = Set(
      concurrentOutputs.map {
        SHA256.hash(data: Data($0.utf8)).map { String(format: "%02x", $0) }.joined()
      })

    return [
      "adapter": "JavaScriptCore + native uncompressed dictionary loader",
      "engine": "@faanau/kuromoji 0.2.1",
      "jsc_fetch_type": context.evaluateScript("typeof fetch")!.toString()!,
      "jsc_decompression_stream_type": context.evaluateScript("typeof DecompressionStream")!
        .toString()!,
      "eval_ms": evalMS,
      "dictionary_build_ms": buildMS,
      "warm_p50_ms": percentile(Array(durations.dropFirst(20)), 0.50),
      "warm_p95_ms": percentile(Array(durations.dropFirst(20)), 0.95),
      "warm_mean_ms": Array(durations.dropFirst(20)).reduce(0, +) / 100.0,
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
}

@main
struct Issue251KuromojiApp: App {
  @State private var status = "Running Kuromoji iOS benchmark…"

  var body: some Scene {
    WindowGroup {
      Text(status).padding().task {
        do {
          let result = try KuromojiRun().execute()
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
