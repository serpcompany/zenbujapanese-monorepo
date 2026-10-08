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

  init(_ arguments: [String]) {
    var remaining = arguments[...]
    while let argument = remaining.popFirst() {
      switch argument {
      case "--script": remaining.popFirst().map { script = URL(filePath: $0) }
      case "--out": remaining.popFirst().map { output = URL(filePath: $0) }
      case "--child": isChild = true
      default: recordings.append(URL(filePath: argument))
      }
    }
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

let options = Options(Array(CommandLine.arguments.dropFirst()))
guard !options.recordings.isEmpty else {
  print("Usage: translate-replay [--script file.json] [--out folder] recording-folder...")
  exit(2)
}
do {
  if options.isChild {
    try await replayOne(options)
  } else {
    exit(try await replayAll(options) ? 0 : 1)
  }
} catch {
  print("translate-replay: \(error)")
  exit(1)
}
