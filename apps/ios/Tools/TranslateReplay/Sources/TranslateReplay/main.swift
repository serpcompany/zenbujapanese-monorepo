import Foundation

struct Options {
  static let defaultScript = URL(filePath: #filePath)
    .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    .appending(path: "Scripts/fixture-pairs-monologue.json")

  var script = defaultScript
  var output = FileManager.default.temporaryDirectory.appending(
    path: "TranslateReplay/\(Int(Date.now.timeIntervalSince1970))")
  var recordings: [URL] = []
  var isChild = false

  init(_ arguments: [String]) throws {
    var remaining = arguments[...]
    while let argument = remaining.popFirst() {
      switch argument {
      case "--script": script = URL(filePath: try Self.value(of: argument, from: &remaining))
      case "--out": output = URL(filePath: try Self.value(of: argument, from: &remaining))
      case "--child": isChild = true
      case let flag where flag.hasPrefix("--"):
        throw ReplayFailure.invalidArguments("unknown option \(flag)")
      default: recordings.append(URL(filePath: argument))
      }
    }
    guard !recordings.isEmpty else { throw ReplayFailure.invalidArguments("no recording folder") }
  }

  private static func value(of flag: String, from remaining: inout ArraySlice<String>) throws
    -> String
  {
    guard let value = remaining.popFirst(), !value.hasPrefix("--") else {
      throw ReplayFailure.invalidArguments("\(flag) needs a value")
    }
    return value
  }
}

func resultFile(in folder: URL) -> URL { folder.appending(path: "result.json") }

func replayOne(_ options: Options) async throws {
  guard let recording = options.recordings.first else { return }
  let script = try Script.load(from: options.script)
  try FileManager.default.createDirectory(at: options.output, withIntermediateDirectories: true)
  let result = try await Replay.run(recording, script: script, output: options.output)
  let encoder = JSONEncoder()
  encoder.outputFormatting = [.prettyPrinted, .withoutEscapingSlashes]
  try encoder.encode(result).write(to: resultFile(in: options.output))
}

func replayAll(_ options: Options) async throws -> Bool {
  var results: [ReplayResult] = []
  for recording in options.recordings {
    let folder = options.output.appending(path: recording.lastPathComponent)
    let child = Process()
    child.executableURL = URL(filePath: CommandLine.arguments[0])
    child.arguments = [
      "--child", "--script", options.script.path, "--out", folder.path, recording.path,
    ]
    try child.run()
    while child.isRunning { try await Task.sleep(for: .milliseconds(500)) }
    guard child.terminationStatus == 0,
      let data = try? Data(contentsOf: resultFile(in: folder))
    else { throw ReplayFailure.childFailed(recording.lastPathComponent) }
    results.append(try JSONDecoder().decode(ReplayResult.self, from: data))
  }
  for result in results { print(Report.render(result), terminator: "\n\n") }
  print(Report.summary(results))
  print("Logs and results: \(options.output.path)")
  return results.allSatisfy(\.score.passes)
}

#if !DEBUG
  print("translate-replay: build it for debugging (swift run's default); its timings come from Debug diagnostics")
  exit(2)
#endif
do {
  let options = try Options(Array(CommandLine.arguments.dropFirst()))
  if options.isChild {
    try await replayOne(options)
  } else {
    exit(try await replayAll(options) ? 0 : 1)
  }
} catch ReplayFailure.invalidArguments(let reason) {
  print("translate-replay: \(reason)")
  print("Usage: translate-replay [--script file.json] [--out folder] recording-folder...")
  exit(2)
} catch {
  print("translate-replay: \(error)")
  exit(1)
}
