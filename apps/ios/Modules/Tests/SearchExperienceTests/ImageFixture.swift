import CoreGraphics
import Foundation
import Testing

@testable import SearchExperience

enum ImageFixture {
  static func png(width: Int, height: Int) throws -> Data {
    let image = try #require(solidImage(width: width, height: height))
    return try #require(ImageCoding.pngData(image))
  }

  static func solidImage(width: Int, height: Int) -> CGImage? {
    ImageCoding.drawing(width: width, height: height) { context in
      context.setFillColor(CGColor(red: 0.2, green: 0.4, blue: 0.6, alpha: 1))
      context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    }
  }

  static func grayPNG(width: Int, height: Int) throws -> Data {
    let context = try #require(
      CGContext(
        data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
        space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue))
    context.setFillColor(gray: 0.5, alpha: 1)
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    let image = try #require(context.makeImage())
    return try #require(ImageCoding.pngData(image))
  }

  static func folder(_ name: String) throws -> URL {
    let folder = FileManager.default.temporaryDirectory
      .appending(path: "\(name)-\(UUID().uuidString)", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    return folder
  }
}
