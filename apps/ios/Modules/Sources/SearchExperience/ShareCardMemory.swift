import Foundation

enum ShareCardMemory {
  static let logName = "share-card-memory.log"

  static func note(_ moment: String) {
    #if DEBUG
      guard let folder = SharedContainer.folder else { return }
      var info = task_vm_info_data_t()
      var count = mach_msg_type_number_t(
        MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size)
      let read = withUnsafeMutablePointer(to: &info) {
        $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
          task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
        }
      }
      guard read == KERN_SUCCESS else { return }
      let megabytes = { (bytes: UInt64) in String(format: "%.1f", Double(bytes) / 1_048_576) }
      let line =
        "\(Date().ISO8601Format()) \(moment): \(megabytes(info.phys_footprint)) MB, "
        + "peak \(megabytes(UInt64(info.ledger_phys_footprint_peak))) MB\n"
      let log = folder.appending(path: logName)
      try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
      if let handle = try? FileHandle(forWritingTo: log) {
        _ = try? handle.seekToEnd()
        try? handle.write(contentsOf: Data(line.utf8))
        try? handle.close()
      } else {
        try? Data(line.utf8).write(to: log)
      }
    #endif
  }
}
