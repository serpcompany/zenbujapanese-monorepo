import CoreGraphics
import Foundation

#if DEBUG
  final class StandInAccountService: URLProtocol {
    static let email = "learner@example.com"
    static let sessionToken = "stand-in-session.signed"
    static let name = "Kana Fan"
    static let username = "kana_fan"
    static let searchKey = String(repeating: "5a", count: 32)
    static let needsSubscription = "Syncing and photo files need a subscription."
    static let releaseKeptNotice = "com.zenbujapanese.dictionary.uitests.release-kept"
    private static let keptReleased = DispatchSemaphore(value: 0)
    private static let watchesRelease: Void = DarwinNotice.observe(releaseKeptNotice) { _ in
      keptReleased.signal()
    }
    static let photo =
      ImageCoding.drawing(width: 8, height: 8) { context in
        context.setFillColor(CGColor(red: 0.9, green: 0.5, blue: 0.2, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: 8, height: 8))
      }.flatMap(ImageCoding.pngData) ?? Data()

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}

    override func startLoading() {
      guard let url = request.url else { return }
      let route = "\(request.httpMethod ?? "GET") \(url.path())"
      let (status, body, headers): (Int, Data, [String: String]) =
        route == "GET /v1/photos/\(Self.photo.sha256)" && !StandInSubscription.shared.refusesSync
        ? (200, Self.photo, ["Content-Type": "image/png"])
        : Self.json(Self.answer(route, body: request.bodyData))
      let response = HTTPURLResponse(
        url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)
      client?.urlProtocol(self, didReceive: response!, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: body)
      client?.urlProtocolDidFinishLoading(self)
    }

    private static func json(_ answer: (Int, Any, [String: String])) -> (Int, Data, [String: String]) {
      (
        answer.0, (try? JSONSerialization.data(withJSONObject: answer.1)) ?? Data(),
        answer.2.merging(["Content-Type": "application/json"]) { a, _ in a }
      )
    }

    private static func answer(_ route: String, body: Data) -> (Int, Any, [String: String]) {
      switch route {
      case "GET /v1/me/subscription":
        (200, StandInSubscription.shared.answer, [:])
      case "POST /v1/me/subscription/apple":
        (200, StandInSubscription.shared.buy(body), [:])
      case let cloud
      where StandInSubscription.shared.refusesSync
        && (cloud == "POST /v1/sync" || cloud.contains(" /v1/photos/")):
        (402, ["error": ["code": "subscription_required", "message": Self.needsSubscription]], [:])
      case "POST /v1/auth/sign-in/nonce":
        (200, ["nonce": "stand-in-nonce"], [:])
      case "POST /v1/auth/sign-in/social", "POST /v1/auth/sign-in/email-otp":
        (200, signedIn, ["set-auth-token": sessionToken])
      case "POST /v1/auth/email-otp/send-verification-otp", "POST /v1/auth/sign-out":
        (200, ["success": true], [:])
      case "GET /v1/auth/token":
        (200, ["token": accessToken], [:])
      case "GET /v1/auth/list-accounts":
        (200, [["providerId": "apple", "accountId": "stand-in"]], [:])
      case "POST /v1/sync":
        (200, sync(body), [:])
      case "GET /v1/me":
        (200, profile, [:])
      case "DELETE /v1/me":
        (
          200,
          [
            "status": "deleted",
            "appStoreSubscriptionContinues": StandInSubscription.shared.runsInTheAppStore,
          ], [:]
        )
      case let put where put.hasPrefix("PUT /v1/photos/"):
        refusedUpload ?? (201, ["id": String(put.dropFirst("PUT /v1/photos/".count))], [:])
      default:
        (404, ["error": ["code": "not_found", "message": route]], [:])
      }
    }

    private static var refusedUpload: (Int, Any, [String: String])? {
      let code = ProcessInfo.processInfo.environment[LaunchHarness.accountRefusesStandInKey]
      let status = ["too_many_photos": 409, "photos_unavailable": 503]
      guard let code, let status = status[code] else { return nil }
      return (status, ["error": ["code": code, "message": code]], [:])
    }

    private static var signedIn: [String: Any] {
      [
        "token": "stand-in-session",
        "user": [
          "id": "stand-in-learner", "email": email, "name": "", "emailVerified": true,
          "image": NSNull(), "createdAt": "2026-10-09T00:00:00.000Z",
          "updatedAt": "2026-10-09T00:00:00.000Z",
        ],
      ]
    }

    private static var profile: [String: Any] {
      [
        "id": "stand-in-learner", "name": name, "username": username, "email": email,
        "version": 1, "createdAt": "2026-10-09T00:00:00.000Z",
        "updatedAt": "2026-10-09T00:00:00.000Z",
      ]
    }

    private static var accessToken: String {
      let claims: [String: Any] = [
        "sub": "stand-in-learner", "exp": Int(Date.now.timeIntervalSince1970) + 15 * 60,
      ]
      let encoded = ((try? JSONSerialization.data(withJSONObject: claims)) ?? Data())
        .base64EncodedString()
        .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
        .replacingOccurrences(of: "=", with: "")
      return "eyJhbGciOiJFZERTQSJ9.\(encoded).stand-in"
    }

    private static func sync(_ body: Data) -> [String: Any] {
      let request = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any]
      let mutations = request?["mutations"] as? [[String: Any]] ?? []
      let results = mutations.compactMap { mutation -> [String: Any]? in
        (mutation["id"] as? String).map { ["id": $0, "status": "applied", "version": 1] }
      }
      let kept = ProcessInfo.processInfo.environment[LaunchHarness.accountKeptStandInKey]
      let elsewhere = request?["cursor"] is String || kept == nil ? [] : keptElsewhere
      if !elsewhere.isEmpty, kept == "hold" {
        _ = watchesRelease
        _ = keptReleased.wait(timeout: .now() + 60)
      }
      return [
        "results": results, "changes": elsewhere, "cursor": "stand-in", "hasMore": false,
        "searchKey": searchKey,
      ]
    }

    private static var keptElsewhere: [[String: Any]] {
      let photoID = photo.sha256
      let searchID = KeptChanges.searchID("猫", under: searchKey) ?? ""
      let at = "2026-10-09T00:00:00.000Z"
      return [
        put("photo", photoID, ["id": photoID, "name": "猫.png", "savedAt": at]),
        put(
          "photoWord", "\(photoID)/kanji:猫",
          [
            "photoId": photoID, "itemId": "kanji:猫", "headword": "猫", "reading": "ねこ",
            "savedAt": at,
          ]),
        put("setting", "readingAids.romaji", ["name": "readingAids.romaji", "value": true]),
        put("recentSearch", searchID, ["id": searchID, "query": "猫", "searchedAt": at]),
      ]
    }

    private static func put(_ entity: String, _ id: String, _ data: [String: Any]) -> [String: Any] {
      ["entity": entity, "entityId": id, "operation": "put", "version": 1, "data": data]
    }
  }

  extension URLRequest {
    var bodyData: Data {
      if let httpBody { return httpBody }
      guard let stream = httpBodyStream else { return Data() }
      stream.open()
      defer { stream.close() }
      var data = Data()
      var buffer = [UInt8](repeating: 0, count: 4096)
      while stream.hasBytesAvailable {
        let count = stream.read(&buffer, maxLength: buffer.count)
        guard count > 0 else { break }
        data.append(buffer, count: count)
      }
      return data
    }
  }
#endif
