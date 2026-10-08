#if DEBUG
  import AVFoundation
  import Foundation

  public final class TranslateDiagnostics: @unchecked Sendable {
    public static let shared = TranslateDiagnostics()

    private let queue = DispatchQueue(label: "com.zenbujapanese.translate-diagnostics")
    private var root = URL.cachesDirectory.appending(path: "TranslateDiagnostics")
    private var log: FileHandle?
    private var audio: AVAudioFile?
    private var folder: URL?
    private var startedAt = Date()

    public func record(into root: URL) {
      queue.sync { self.root = root }
    }

    public func begin() {
      queue.async { [self] in
        closeFiles()
        let stamp = ISO8601DateFormatter().string(from: .now).replacingOccurrences(of: ":", with: "-")
        let folder = root.appending(path: stamp)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        FileManager.default.createFile(atPath: folder.appending(path: "events.log").path, contents: nil)
        log = try? FileHandle(forWritingTo: folder.appending(path: "events.log"))
        self.folder = folder
        startedAt = .now
      }
    }

    public func note(_ line: String) {
      let at = Date.now
      queue.async { [self] in
        let stamped = String(format: "%8.2f ", at.timeIntervalSince(startedAt)) + line + "\n"
        log?.write(Data(stamped.utf8))
      }
    }

    func record(_ buffer: AVAudioPCMBuffer) {
      guard let copy = RecognizerFeed.copy(of: buffer) else { return }
      queue.async { [self] in
        if audio == nil, let folder {
          audio = try? AVAudioFile(
            forWriting: folder.appending(path: "heard.wav"), settings: copy.format.settings,
            commonFormat: copy.format.commonFormat, interleaved: copy.format.isInterleaved)
        }
        try? audio?.write(from: copy)
      }
    }

    public func end() {
      queue.sync { closeFiles() }
    }

    private func closeFiles() {
      try? log?.close()
      log = nil
      audio = nil
      folder = nil
    }
  }
#endif
