import AVFoundation

extension AVAudioConverter {
  func convertedBuffer(
    from buffer: AVAudioPCMBuffer, into output: AVAudioPCMBuffer
  ) -> AVAudioPCMBuffer? {
    var supplied = false
    var error: NSError?
    convert(to: output, error: &error) { _, status in
      if supplied {
        status.pointee = .noDataNow
        return nil
      }
      supplied = true
      status.pointee = .haveData
      return buffer
    }
    return error == nil && output.frameLength > 0 ? output : nil
  }
}
