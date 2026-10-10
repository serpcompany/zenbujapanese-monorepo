import Foundation

#if DEBUG
  final class StandInAccountService: URLProtocol {
    static let email = "learner@example.com"
    static let sessionToken = "stand-in-session.signed"

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}

    override func startLoading() {
      guard let url = request.url else { return }
      let (status, body, headers) = Self.answer(
        "\(request.httpMethod ?? "GET") \(url.path())", body: request.bodyData)
      let response = HTTPURLResponse(
        url: url, statusCode: status, httpVersion: "HTTP/1.1",
        headerFields: headers.merging(["Content-Type": "application/json"]) { a, _ in a })
      client?.urlProtocol(self, didReceive: response!, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(
        self, didLoad: (try? JSONSerialization.data(withJSONObject: body)) ?? Data())
      client?.urlProtocolDidFinishLoading(self)
    }

    private static func answer(_ route: String, body: Data) -> (Int, Any, [String: String]) {
      switch route {
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
      case "DELETE /v1/me":
        (200, ["status": "deleted"], [:])
      default:
        (404, ["error": ["code": "not_found", "message": route]], [:])
      }
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
      return ["results": results, "changes": [], "cursor": "stand-in", "hasMore": false]
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
