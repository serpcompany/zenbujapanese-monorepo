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

  static let shared = UserProfile()
  private static let storageKey = "user-profile.v1"
  private nonisolated static let photoDimension: CGFloat = 512
  private let defaults: UserDefaults
  private let photoURL: URL

  private(set) var name = ""
  private(set) var username = ""
  var email = "" {
    didSet { persist() }
  }
  private(set) var photo: CGImage?
  var refusal: ProfileRefusal?
  @ObservationIgnored var changeObserver: ((SavedItemChange) -> Void)?

  var fields: ProfileFields { ProfileFields(name: name, username: username) }

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

  func edit(_ edited: ProfileFields) {
    let previous = fields.limited(to: edited)
    guard edited != previous else { return }
    write(edited)
    refusal = nil
    let uploadable = edited.uploadable
    guard !uploadable.isEmpty else { return }
    changeObserver?(.profileEdited(uploadable, previous: previous.limited(to: uploadable)))
  }

  func applySynced(_ synced: ProfileFields) {
    write(synced)
  }

  private func write(_ edited: ProfileFields) {
    if let name = edited.name { self.name = name }
    if let username = edited.username { self.username = username }
    persist()
  }

  func setPhoto(_ data: Data) async {
    let url = photoURL
    let made = await Task.detached(priority: .userInitiated) { () -> (CGImage, Data)? in
      guard let scaled = Self.squareThumbnail(from: data),
        let jpeg = ImageCoding.jpegData(scaled, quality: 0.85),
        Self.write(jpeg, to: url)
      else { return nil }
      return (scaled, jpeg)
    }.value
    guard let (scaled, jpeg) = made else { return }
    photo = scaled
    changeObserver?(.kept(KeptChanges.profilePhotoSet(jpeg.sha256)))
  }

  func removePhoto() {
    guard photo != nil || FileManager.default.fileExists(atPath: photoURL.path) else { return }
    applySyncedPhotoRemoval()
    changeObserver?(.kept(KeptChanges.profilePhotoRemoved))
  }

  var photoData: Data? { try? Data(contentsOf: photoURL) }
  var cantReadPhoto: Bool { FileManager.default.fileExists(atPath: photoURL.path) && photoData == nil }

  func applySyncedPhoto(_ data: Data) {
    guard let image = ImageCoding.image(from: data), Self.write(data, to: photoURL) else { return }
    photo = image
  }

  func applySyncedPhotoRemoval() {
    photo = nil
    try? FileManager.default.removeItem(at: photoURL)
  }

  private nonisolated static func write(_ data: Data, to url: URL) -> Bool {
    try? FileManager.default.createDirectory(
      at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    return (try? data.write(to: url, options: .atomic)) != nil
  }

  nonisolated static let usernameLengths = 3...30
  nonisolated static let accountNameLengths = 1...100

  nonisolated static let accountNameRule =
    "Your Zenbu account needs a name of \(accountNameLengths.lowerBound) to \(accountNameLengths.upperBound) characters, with no control characters."

  nonisolated static let usernameRule =
    "A username is \(usernameLengths.lowerBound) to \(usernameLengths.upperBound) letters a to z, digits, or underscores."

  enum UsernameEdit: Equatable, Sendable {
    case keep
    case save(String)
    case refuse
  }

  nonisolated static func usernameEdit(_ typed: String, over stored: String) -> UsernameEdit {
    if typed == stored { return .keep }
    guard let accepted = AccountRules.shared.usernameToSave(typed) else { return .refuse }
    return .save(accepted)
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
