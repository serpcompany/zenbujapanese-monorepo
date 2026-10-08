import CoreGraphics
import Foundation
import ImageIO
import SwiftUI
import Testing
import UniformTypeIdentifiers

@testable import SearchExperience

@Suite("Platform adapters")
struct PlatformAdapterTests {
  @Test("an adaptive color resolves to its light and dark values")
  func adaptiveColor() {
    let color = Color.adaptive(
      light: DisplayP3Color(red: 1, green: 0, blue: 0),
      dark: DisplayP3Color(red: 0, green: 0, blue: 1))
    let light = color.resolve(in: environment(.light))
    let dark = color.resolve(in: environment(.dark))
    #expect(light.red > light.blue)
    #expect(dark.blue > dark.red)
  }

  @Test("decoded image data keeps its size, and data that isn't an image decodes to nothing")
  func decodedImage() throws {
    let png = try pngData(width: 40, height: 20)
    let decoded = try #require(DecodedImage(data: png))
    #expect(decoded.size == CGSize(width: 40, height: 20))
    #expect(DecodedImage(data: Data("not an image".utf8)) == nil)
    #expect(Image(imageData: Data()) == nil)
  }

  @Test("a photo's orientation is applied when it's decoded, as UIImage did")
  func orientation() throws {
    let image = try #require(solidImage(width: 60, height: 20))
    let data = NSMutableData()
    let destination = try #require(
      CGImageDestinationCreateWithData(data, UTType.jpeg.identifier as CFString, 1, nil))
    CGImageDestinationAddImage(
      destination, image, [kCGImagePropertyOrientation: CGImagePropertyOrientation.right.rawValue]
        as CFDictionary)
    #expect(CGImageDestinationFinalize(destination))
    let decoded = try #require(ImageCoding.image(from: data as Data))
    #expect(decoded.width == 20)
    #expect(decoded.height == 60)
  }

  @Test("a pasted image is stored as a JPEG no larger than Image Search reads")
  func pastedImage() throws {
    let png = try pngData(width: 5_000, height: 100)
    let asset = try #require(ImageTextAsset(pastedImageData: png, name: "Pasted Image"))
    let source = try #require(CGImageSourceCreateWithData(asset.data as CFData, nil))
    #expect(CGImageSourceGetType(source) as String? == UTType.jpeg.identifier)
    let stored = try #require(ImageCoding.image(from: asset.data))
    #expect(stored.width == 4_096)
    #expect(ImageTextAsset(pastedImageData: Data("text".utf8), name: "Pasted Image") == nil)
  }

  @MainActor
  @Test("a profile photo is cropped to a 512-point square and survives a reload")
  func profilePhoto() async throws {
    let suite = "platform-profile-\(UUID().uuidString)"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let photoURL = FileManager.default.temporaryDirectory.appending(path: "\(suite).jpg")
    defer { try? FileManager.default.removeItem(at: photoURL) }
    let png = try pngData(width: 300, height: 200)

    let profile = UserProfile(defaults: defaults, photoURL: photoURL)
    await profile.setPhoto(png)
    #expect(profile.photo?.width == 512)
    #expect(profile.photo?.height == 512)

    let reloaded = UserProfile(defaults: defaults, photoURL: photoURL)
    #expect(reloaded.photo?.width == 512)
    #expect(!reloaded.isEmpty)
  }

  @MainActor
  @Test("Settings links exist for the camera and the microphone")
  func settingsLinks() {
    #expect(SystemSettings.url(for: .camera) != nil)
    #expect(SystemSettings.url(for: .microphone) != nil)
  }

  @Test("the device is named for the platform it runs on")
  func deviceName() {
    #expect(["iPhone", "iPad", "Mac"].contains(ThisDevice.name))
    #expect(!ThisDevice.translationLanguagesSettings.isEmpty)
  }

  private func environment(_ scheme: ColorScheme) -> EnvironmentValues {
    var values = EnvironmentValues()
    values.colorScheme = scheme
    return values
  }

  private func pngData(width: Int, height: Int) throws -> Data {
    let image = try #require(solidImage(width: width, height: height))
    return try #require(ImageCoding.pngData(image))
  }

  private func solidImage(width: Int, height: Int) -> CGImage? {
    ImageCoding.drawing(width: width, height: height) { context in
      context.setFillColor(CGColor(red: 0.2, green: 0.4, blue: 0.6, alpha: 1))
      context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    }
  }
}
