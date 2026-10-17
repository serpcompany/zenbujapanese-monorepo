import CoreGraphics
import Foundation
import ImageIO
import Observation

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
  private(set) var photo: CGImage?

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
      photo = ImageCoding.image(from: data)
    }
    guard let data = defaults.storedData(forKey: Self.storageKey) else { return }
    guard let stored = try? JSONDecoder().decode(StoredProfile.self, from: data) else {
      UnreadableCopy.keep(Self.storageKey, in: defaults)
      return
    }
    name = stored.name
    username = stored.username
    email = stored.email
  }

  func setPhoto(_ data: Data) async {
    let url = photoURL
    let scaled = await Task.detached(priority: .userInitiated) { () -> CGImage? in
      guard let scaled = Self.squareThumbnail(from: data),
        let jpeg = ImageCoding.jpegData(scaled, quality: 0.85)
      else { return nil }
      try? FileManager.default.createDirectory(
        at: url.deletingLastPathComponent(),
        withIntermediateDirectories: true
      )
      try? jpeg.write(to: url, options: .atomic)
      return scaled
    }.value
    if let scaled { photo = scaled }
  }

  func removePhoto() {
    photo = nil
    try? FileManager.default.removeItem(at: photoURL)
  }

  nonisolated static let usernameLengths = 3...30

  nonisolated static let usernameRule =
    "A username is \(usernameLengths.lowerBound) to \(usernameLengths.upperBound) letters a to z, digits, or underscores."

  nonisolated static func acceptedUsername(_ typed: String) -> String? {
    let folded = typed.precomposedStringWithCompatibilityMapping.unicodeScalars
    guard let first = folded.firstIndex(where: { !isTrimmedFromAUsername($0) }),
      let last = folded.lastIndex(where: { !isTrimmedFromAUsername($0) })
    else { return nil }
    let username = String(String.UnicodeScalarView(folded[first...last])).lowercased()
    guard usernameLengths.contains(username.unicodeScalars.count),
      username.unicodeScalars.allSatisfy(isAUsernameScalar)
    else { return nil }
    return username
  }

  enum UsernameEdit: Equatable, Sendable {
    case keep
    case save(String)
    case refuse
  }

  nonisolated static func usernameEdit(_ typed: String, over stored: String) -> UsernameEdit {
    if typed == stored { return .keep }
    if typed.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return .save("") }
    guard let accepted = acceptedUsername(typed) else { return .refuse }
    return .save(accepted)
  }

  private nonisolated static let usernameLetters: ClosedRange<Unicode.Scalar> = "a"..."z"
  private nonisolated static let usernameDigits: ClosedRange<Unicode.Scalar> = "0"..."9"
  private nonisolated static let byteOrderMark: Unicode.Scalar = "\u{FEFF}"
  private nonisolated static let nextLine: Unicode.Scalar = "\u{85}"

  private nonisolated static func isAUsernameScalar(_ scalar: Unicode.Scalar) -> Bool {
    usernameLetters.contains(scalar) || usernameDigits.contains(scalar) || scalar == "_"
  }

  private nonisolated static func isTrimmedFromAUsername(_ scalar: Unicode.Scalar) -> Bool {
    scalar == byteOrderMark || (scalar.properties.isWhitespace && scalar != nextLine)
  }

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

  private nonisolated static func squareThumbnail(from data: Data) -> CGImage? {
    guard
      let source = CGImageSourceCreateWithData(data as CFData, nil),
      let image = ImageCoding.thumbnail(from: source, maxPixelSize: Int(photoDimension * 4))
    else { return nil }
    let width = CGFloat(image.width)
    let height = CGFloat(image.height)
    let scale = photoDimension / min(width, height)
    let drawSize = CGSize(width: width * scale, height: height * scale)
    let origin = CGPoint(
      x: (photoDimension - drawSize.width) / 2, y: (photoDimension - drawSize.height) / 2)
    let side = Int(photoDimension)
    return ImageCoding.drawing(width: side, height: side) { context in
      context.interpolationQuality = .high
      context.draw(image, in: CGRect(origin: origin, size: drawSize))
    }
  }

  nonisolated static let defaultPhotoURL = URL.applicationSupportDirectory
    .appending(path: "Profile", directoryHint: .isDirectory)
    .appending(path: "photo.jpg")
}
