import Foundation
import Sentry

enum ProblemArea: String, Sendable {
  case accountSync = "account_sync"
  case frequencyPack = "frequency_pack"
  case languagePack = "language_pack"
  case dictionaryCore = "dictionary_core"
  case translateStart = "translate_start"
}

struct HandledProblem: Equatable, Sendable {
  static let maximumDetails = 4
  static let unknownCode = "unknown"
  private static let stableCharacters = Set("abcdefghijklmnopqrstuvwxyz0123456789_.-")
  private static let serviceCodeCharacters = Set("abcdefghijklmnopqrstuvwxyz_")

  let area: ProblemArea
  let code: String
  let details: [String: String]

  init(area: ProblemArea, code: String, details: [String: String] = [:]) {
    self.area = area
    self.code = Self.isStable(code) ? code : Self.unknownCode
    self.details = Dictionary(
      uniqueKeysWithValues: details.filter { Self.isStable($0.key) && Self.isStable($0.value) }
        .sorted { $0.key < $1.key }.prefix(Self.maximumDetails).map { ($0.key, $0.value) })
  }

  init?(_ error: Error, in area: ProblemArea, details: [String: String] = [:]) {
    guard !Self.isExpected(error) else { return nil }
    guard let error = error as? AccountServiceError else {
      self.init(area: area, code: Self.code(for: error), details: details)
      return
    }
    guard let problem = Self.accountService(error, in: area) else { return nil }
    self.init(
      area: area, code: problem.code,
      details: problem.details.merging(details) { own, _ in own })
  }

  var key: String { "\(area.rawValue).\(code)" }

  func event() -> Event {
    let event = Event(level: .error)
    event.message = SentryMessage(formatted: "\(area.rawValue): \(code)")
    event.tags = ["problem.area": area.rawValue, "problem.code": code]
    event.fingerprint = ["handled-problem", area.rawValue, code]
    event.context = [
      "problem": details.merging(["area": area.rawValue, "code": code]) { _, own in own }
    ]
    return event
  }

  static func isStable(_ text: String) -> Bool {
    (1...64).contains(text.count) && text.allSatisfy(stableCharacters.contains)
  }

  static func code(for error: Error) -> String {
    let mirror = Mirror(reflecting: error)
    let errorType = type(of: error)
    let typeName = snakeCase(String(describing: errorType))
    guard mirror.displayStyle == .enum else {
      let bridged = error as NSError
      guard bridged.domain != String(reflecting: errorType) else { return stableOrUnknown(typeName) }
      return stableOrUnknown("\(snakeCase(bridged.domain)).\(bridged.code)")
    }
    let describesItself =
      errorType is any CustomStringConvertible.Type
      || errorType is any CustomDebugStringConvertible.Type
      || errorType is any TextOutputStreamable.Type
    let caseName =
      mirror.children.first?.label ?? (describesItself ? nil : String(describing: error))
    let code = "\(typeName).\(caseName.map(snakeCase) ?? String((error as NSError).code))"
    return isStable(code) ? code : stableOrUnknown(typeName)
  }

  static func snakeCase(_ name: String) -> String {
    var result = ""
    var previous: Character?
    for character in name {
      if character.isUppercase, let previous, previous.isLowercase || previous.isNumber {
        result.append("_")
      }
      let lowered = Character(character.lowercased())
      result.append(stableCharacters.contains(lowered) && lowered != "." ? lowered : "_")
      previous = character
    }
    return result.split(separator: "_", omittingEmptySubsequences: true).joined(separator: "_")
  }

  private static func stableOrUnknown(_ code: String) -> String {
    isStable(code) ? code : unknownCode
  }

  static let expectedURLErrors: Set<Int> = Set(
    [
      URLError.Code.cancelled, .notConnectedToInternet, .networkConnectionLost, .timedOut,
      .cannotFindHost, .cannotConnectToHost, .dnsLookupFailed, .dataNotAllowed,
      .internationalRoamingOff, .callIsActive,
    ].map(\.rawValue))

  private static func isExpected(_ error: Error) -> Bool {
    if error is CancellationError { return true }
    let bridged = error as NSError
    return bridged.domain == NSURLErrorDomain && expectedURLErrors.contains(bridged.code)
  }

  private static func accountService(
    _ error: AccountServiceError, in area: ProblemArea
  ) -> HandledProblem? {
    switch error {
    case .unreachable, .sessionEnded:
      return nil
    case .refused(let status, let serviceCode, _, _):
      var details = ["status": String(status)]
      if (1...64).contains(serviceCode.count),
        serviceCode.allSatisfy(serviceCodeCharacters.contains)
      {
        details["service_code"] = serviceCode
      }
      return HandledProblem(area: area, code: "account_service_error.refused", details: details)
    case .unreadableAnswer(let status):
      return HandledProblem(
        area: area, code: "account_service_error.unreadable_answer",
        details: ["status": String(status)])
    case .missingSessionToken, .differentAccount:
      return HandledProblem(area: area, code: code(for: error))
    }
  }
}
