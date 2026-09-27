import Foundation
import ImageIO
import Observation
import UIKit

@MainActor
@Observable
final class UserProfile {
  private struct StoredProfile: Codable {
    let name: String
    let username: String
    let email: String
  }

  private static let storageKey = "user-profile.v1"
  private nonisolated static let photoDimension: CGFloat = 512
  private let defaults: UserDefaults
  private let photoURL: URL

  var name = "" {
    didSet { persist() }
  }
  var username = "" {
    didSet { persist() }
  }
  var email = "" {
    didSet { persist() }
  }
  private(set) var photo: UIImage?

  var isEmpty: Bool {
    name.isEmpty && username.isEmpty && email.isEmpty && photo == nil
  }

  var initials: String {
    let letters = name.split(separator: " ").prefix(2).compactMap(\.first)
    return String(letters).uppercased()
  }

  init(defaults: UserDefaults = .standard, photoURL: URL = UserProfile.defaultPhotoURL) {
    self.defaults = defaults
    self.photoURL = photoURL
    if let data = try? Data(contentsOf: photoURL) {
      photo = UIImage(data: data)
    }
    guard
      let data = defaults.data(forKey: Self.storageKey),
      let stored = try? JSONDecoder().decode(StoredProfile.self, from: data)
    else { return }
    name = stored.name
    username = stored.username
    email = stored.email
  }

  func setPhoto(_ data: Data) async {
    let url = photoURL
    let scaled = await Task.detached(priority: .userInitiated) { () -> UIImage? in
      guard let scaled = Self.squareThumbnail(from: data),
        let jpeg = scaled.jpegData(compressionQuality: 0.85)
      else { return nil }
      try? FileManager.default.createDirectory(
        at: url.deletingLastPathComponent(),
        withIntermediateDirectories: true
      )
      try? jpeg.write(to: url, options: .atomic)
      return scaled
    }.value
    // An undecodable pick keeps the current photo.
    if let scaled { photo = scaled }
  }

  func removePhoto() {
    photo = nil
    try? FileManager.default.removeItem(at: photoURL)
  }

  nonisolated static let usernameLengthLimit = 30

  /// Normalizes what the learner typed into the stored username: lowercase `a–z`, `0–9`, `_`, and
  /// `.`, without a leading `@`. Other scripts belong in the name, which keeps usernames typeable
  /// and free of look-alike full-width forms.
  nonisolated static func normalizedUsername(_ input: String) -> String {
    let allowed = Set("abcdefghijklmnopqrstuvwxyz0123456789_.")
    let characters = input.drop(while: { $0 == "@" }).lowercased().filter(allowed.contains)
    return String(characters.prefix(usernameLengthLimit))
  }

  /// Whether the text is exactly one email address, as recognized by Foundation's data detector.
  nonisolated static func isValidEmail(_ input: String) -> Bool {
    guard
      !input.isEmpty,
      let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
    else { return false }
    let range = NSRange(input.startIndex..., in: input)
    let matches = detector.matches(in: input, range: range)
    guard matches.count == 1, let match = matches.first else { return false }
    return match.range == range && match.url?.scheme == "mailto"
  }

  private func persist() {
    let stored = StoredProfile(name: name, username: username, email: email)
    guard let data = try? JSONEncoder().encode(stored) else { return }
    defaults.set(data, forKey: Self.storageKey)
  }

  /// Decodes a downsampled image with ImageIO so a full-resolution photo never lands in memory.
  private nonisolated static func squareThumbnail(from data: Data) -> UIImage? {
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceThumbnailMaxPixelSize: photoDimension * 4,
    ]
    guard
      let source = CGImageSourceCreateWithData(data as CFData, nil),
      let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
    else { return nil }
    let image = UIImage(cgImage: cgImage)
    let side = min(image.size.width, image.size.height)
    let scale = photoDimension / side
    let size = CGSize(width: photoDimension, height: photoDimension)
    let drawSize = CGSize(width: image.size.width * scale, height: image.size.height * scale)
    let origin = CGPoint(x: (size.width - drawSize.width) / 2, y: (size.height - drawSize.height) / 2)
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    return UIGraphicsImageRenderer(size: size, format: format).image { _ in
      image.draw(in: CGRect(origin: origin, size: drawSize))
    }
  }

  nonisolated static let defaultPhotoURL = URL.applicationSupportDirectory
    .appending(path: "Profile", directoryHint: .isDirectory)
    .appending(path: "photo.jpg")
}
