import CryptoKit
import Foundation
import Testing

@testable import SearchExperience

@Suite("File digests")
struct DigestTests {
  static func footprint() -> UInt64 {
    var info = task_vm_info_data_t()
    var count = mach_msg_type_number_t(
      MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size)
    _ = withUnsafeMutablePointer(to: &info) {
      $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
        task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
      }
    }
    return info.phys_footprint
  }

  @Test("hashing a file holds one chunk of it at a time, however long the file")
  func oneChunkAtATime() throws {
    let file = URL.temporaryDirectory.appending(path: "digest-\(UUID().uuidString).bin")
    defer { try? FileManager.default.removeItem(at: file) }
    let contents = Data((0..<(16 * fileDigestChunk)).lazy.map { UInt8(truncatingIfNeeded: $0 / 7) })
    try contents.write(to: file)
    let expected = SHA256.hash(data: contents).hexString
    var grew: UInt64 = 0
    var hashed = ""
    try autoreleasepool {
      let before = Self.footprint()
      hashed = try fileSHA256(file)
      grew = Self.footprint() &- before
    }
    #expect(hashed == expected)
    #expect(grew < UInt64(4 * fileDigestChunk))
  }
}
