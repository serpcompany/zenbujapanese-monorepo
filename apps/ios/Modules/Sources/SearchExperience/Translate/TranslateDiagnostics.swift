#if DEBUG
  import AVFoundation
  import Foundation

  final class TranslateDiagnostics: @unchecked Sendable {
    static let shared = TranslateDiagnostics()

    private let queue = DispatchQueue(label: "com.zenbujapanese.translate-diagnostics")
    private var log: FileHandle?
    private var audio: AVAudioFile?
    private var folder: URL?
    private var startedAt = Date()

    func begin() {
      queue.async { [self] in
        closeFiles()
        let stamp = ISO8601DateFormatter().string(from: .now).replacingOccurrences(of: ":", with: "-")
        let folder = URL.cachesDirectory.appending(path: "TranslateDiagnostics/\(stamp)")
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        FileManager.default.createFile(atPath: folder.appending(path: "events.log").path, contents: nil)
        log = try? FileHandle(forWritingTo: folder.appending(path: "events.log"))
        self.folder = folder
        startedAt = .now
      }
    }

    func note(_ line: String) {
      let at = Date.now
      queue.async { [self] in
        let stamped = String(format: "%8.2f ", at.timeIntervalSince(startedAt)) + line + "\n"
        log?.write(Data(stamped.utf8))
      }
    }

    func record(_ buffer: AVAudioPCMBuffer) {
      guard let copy = AnalyzerAudioPipeline.copy(of: buffer) else { return }
      queue.async { [self] in
        if audio == nil, let folder {
          audio = try? AVAudioFile(
            forWriting: folder.appending(path: "heard.wav"), settings: copy.format.settings,
            commonFormat: copy.format.commonFormat, interleaved: copy.format.isInterleaved)
        }
        try? audio?.write(from: copy)
      }
    }

    func end() {
      queue.async { [self] in closeFiles() }
    }

    private func closeFiles() {
      try? log?.close()
      log = nil
      audio = nil
      folder = nil
    }
  }
#endif
