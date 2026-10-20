import Foundation
import Sentry
import Testing

@testable import SearchExperience

@Suite("Handled problems")
struct HandledProblemTests {
  private enum DescribedError: Error, CustomStringConvertible {
    case lookupFailed
    var description: String { "no entry for 食べる" }
  }

  private struct CarriedError: Error {
    let word = "食べる"
  }

  @Test("an error becomes its type and case, never its payload or message")
  func errorsBecomeTheirTypeAndCase() {
    #expect(HandledProblem.code(for: FrequencyPackError.checksumMismatch) == "frequency_pack_error.checksum_mismatch")
    #expect(HandledProblem.code(for: FrequencyPackError.sqlite("SELECT 食べる")) == "frequency_pack_error.sqlite")
    #expect(HandledProblem.code(for: DictionaryCoreError.failed("/var/mobile/a.js")) == "dictionary_core_error.failed")
    #expect(HandledProblem.code(for: LanguageTechnologyPackError.goldenOutputMismatch) == "language_technology_pack_error.golden_output_mismatch")
    #expect(HandledProblem.code(for: CocoaError(.fileReadNoSuchFile)) == "nscocoa_error_domain.260")
  }

  @Test("an error that describes itself or carries content gives no text of its own")
  func describedErrorsGiveNoText() {
    let described = HandledProblem.code(for: DescribedError.lookupFailed)
    #expect(described.hasPrefix("described_error."))
    #expect(!described.contains("lookup"))
    #expect(HandledProblem.code(for: CarriedError()) == "carried_error")
  }

  @Test("each problem is sent at most once a launch, by its area and code")
  func eachProblemOnceALaunch() {
    let code = "once_a_launch." + UUID().uuidString.lowercased().prefix(8)
    #expect(CrashReporter.isFirstThisLaunch(HandledProblem(area: .frequencyPack, code: code)))
    let again = HandledProblem(area: .frequencyPack, code: code, details: ["status": "502"])
    #expect(!CrashReporter.isFirstThisLaunch(again))
    #expect(CrashReporter.isFirstThisLaunch(HandledProblem(area: .accountSync, code: code)))
  }

  @Test("cancellations, lost connections, and an unreachable or ended session aren't problems")
  func expectedOutcomesAreSkipped() {
    #expect(HandledProblem(CancellationError(), in: .frequencyPack) == nil)
    let connectivity: [URLError.Code] = [
      .cancelled, .notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotFindHost,
      .cannotConnectToHost, .dnsLookupFailed, .dataNotAllowed, .internationalRoamingOff,
      .callIsActive,
    ]
    for code in connectivity {
      #expect(HandledProblem(URLError(code), in: .frequencyPack) == nil, "\(code.rawValue)")
    }
    #expect(HandledProblem(AccountServiceError.unreachable, in: .accountSync) == nil)
    #expect(HandledProblem(AccountServiceError.sessionEnded, in: .accountSync) == nil)
  }

  @Test("a download the app's setup or its host broke is reported, by its code alone")
  func setupURLErrorsAreReported() {
    let insecure = HandledProblem(
      URLError(.appTransportSecurityRequiresSecureConnection), in: .frequencyPack)
    #expect(insecure?.code == "nsurlerror_domain.-1022")
    let untrusted = HandledProblem(
      URLError(.serverCertificateUntrusted, userInfo: [
        NSURLErrorFailingURLStringErrorKey: "https://data.zenbujapanese.com/packs/a.zip?token=secret"
      ]), in: .languagePack)
    #expect(untrusted?.code == "nsurlerror_domain.-1202")
    #expect(untrusted?.details == [:])
    #expect(HandledProblem(URLError(.badServerResponse), in: .frequencyPack)?.code == "nsurlerror_domain.-1011")
  }

  @Test("a refused sync keeps its status and a service code, never the service's message")
  func refusedSyncKeepsStatusAndCode() throws {
    let refused = try #require(
      HandledProblem(
        AccountServiceError.refused(
          status: 429, code: "rate_limited", message: "slow down pat@example.com",
          retryAfter: 30),
        in: .accountSync))
    #expect(refused.code == "account_service_error.refused")
    #expect(refused.details == ["status": "429", "service_code": "rate_limited"])

    let seeded = try #require(HandledProblem(CrashReportTest.seededProblem, in: .accountSync))
    #expect(seeded.details == ["status": "400"])
    let unreadable = HandledProblem(AccountServiceError.unreadableAnswer(status: 502), in: .accountSync)
    #expect(unreadable?.details == ["status": "502"])
    #expect(HandledProblem(AccountServiceError.differentAccount, in: .accountSync)?.code == "account_service_error.different_account")
  }

  @Test("a sync or photo file refused for want of a subscription isn't a problem, being the account's state, while other refusals still are")
  func subscriptionRefusalIsntAProblem() {
    let needsSubscription = AccountServiceError.refused(
      status: 402, code: "subscription_required",
      message: "Syncing and photo files need a subscription.", retryAfter: nil)
    #expect(HandledProblem(needsSubscription, in: .accountSync) == nil)
    let full = AccountServiceError.refused(
      status: 409, code: "too_many_photos", message: "", retryAfter: nil)
    #expect(
      HandledProblem(full, in: .accountSync)?.details
        == ["status": "409", "service_code": "too_many_photos"])
  }

  @Test("codes and details are bounded: unstable text is dropped, and at most four details")
  func codesAndDetailsAreBounded() {
    #expect(HandledProblem(area: .translateStart, code: "Microphone denied!").code == "unknown")
    #expect(HandledProblem(area: .translateStart, code: String(repeating: "a", count: 65)).code == "unknown")
    let problem = HandledProblem(
      area: .frequencyPack, code: "checksum",
      details: [
        "pack": "zenbu.tubelex.youtube.ja.unidic-3.1", "file": "単語.csv",
        "email": "pat@example.com", "a": "1", "b": "2", "c": "3",
      ])
    #expect(problem.details == ["a": "1", "b": "2", "c": "3", "pack": "zenbu.tubelex.youtube.ja.unidic-3.1"])
  }

  @Test("a problem's event carries its area and code, and a fingerprint that groups it")
  func eventCarriesAreaAndCode() {
    let event = HandledProblem(area: .languagePack, code: "bundled_pack_unverified", details: ["pack": "sudachi"]).event()
    #expect(event.level == .error)
    #expect(event.message?.formatted == "language_pack: bundled_pack_unverified")
    #expect(event.tags == ["problem.area": "language_pack", "problem.code": "bundled_pack_unverified"])
    #expect(event.fingerprint == ["handled-problem", "language_pack", "bundled_pack_unverified"])
    #expect(event.context?["problem"]?["pack"] as? String == "sudachi")
    #expect(event.context?["problem"]?["code"] as? String == "bundled_pack_unverified")
    #expect(CrashReportScrubber.scrub(event).message?.formatted == event.message?.formatted)
  }

  @Test("Translate's start checks report as stable codes")
  func translateStartCodes() {
    #expect(TranslateStartProblem.microphoneDenied.rawValue == "microphone_denied")
    #expect(TranslateStartProblem.speechUnavailable.rawValue == "speech_unavailable")
    #expect(TranslateStartProblem.translationUnavailable.rawValue == "translation_unavailable")
  }

  @Test("recording does nothing while Sentry isn't running")
  func recordingWithoutSentryDoesNothing() {
    #expect(!SentrySDK.isEnabled)
    CrashReporter.record(FrequencyPackError.invalidPack, in: .frequencyPack)
    CrashReporter.record(HandledProblem(area: .dictionaryCore, code: "bundle_unavailable"))
    #expect(!SentrySDK.isEnabled)
  }
}
