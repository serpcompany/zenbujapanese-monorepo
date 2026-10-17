import AuthenticationServices

struct AppleSignInCredential: Sendable {
  let identityToken: String
  let authorizationCode: String
  var name: AppleSignInName? = nil
}

struct AppleSignInName: Sendable, Equatable {
  let firstName: String?
  let lastName: String?

  init?(_ components: PersonNameComponents?) {
    let first = components?.givenName.flatMap { $0.isEmpty ? nil : $0 }
    let last = components?.familyName.flatMap { $0.isEmpty ? nil : $0 }
    guard first != nil || last != nil else { return nil }
    firstName = first
    lastName = last
  }
}

@MainActor
final class AppleSignIn: NSObject, ASAuthorizationControllerDelegate,
  ASAuthorizationControllerPresentationContextProviding
{
  private var continuation: CheckedContinuation<AppleSignInCredential, Error>?
  private var controller: ASAuthorizationController?

  static func credential(
    nonce: String,
    authorize: @MainActor (_ hashedNonce: String) async throws -> AppleSignInCredential
  ) async throws -> AppleSignInCredential {
    try await authorize(Data(nonce.utf8).sha256)
  }

  static func authorize(hashedNonce: String) async throws -> AppleSignInCredential {
    try await AppleSignIn().perform(hashedNonce: hashedNonce)
  }

  private func perform(hashedNonce: String) async throws -> AppleSignInCredential {
    let request = ASAuthorizationAppleIDProvider().createRequest()
    request.requestedScopes = [.email, .fullName]
    request.nonce = hashedNonce
    let controller = ASAuthorizationController(authorizationRequests: [request])
    controller.delegate = self
    controller.presentationContextProvider = self
    self.controller = controller
    return try await withCheckedThrowingContinuation { continuation in
      self.continuation = continuation
      controller.performRequests()
    }
  }

  func authorizationController(
    controller: ASAuthorizationController,
    didCompleteWithAuthorization authorization: ASAuthorization
  ) {
    guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
      let token = credential.identityToken.flatMap({ String(data: $0, encoding: .utf8) }),
      let code = credential.authorizationCode.flatMap({ String(data: $0, encoding: .utf8) })
    else {
      finish(.failure(ASAuthorizationError(.failed)))
      return
    }
    finish(
      .success(
        AppleSignInCredential(
          identityToken: token, authorizationCode: code,
          name: AppleSignInName(credential.fullName))))
  }

  func authorizationController(
    controller: ASAuthorizationController, didCompleteWithError error: Error
  ) {
    let canceled = (error as? ASAuthorizationError)?.code == .canceled
    finish(.failure(canceled ? CancellationError() : error))
  }

  func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
    keyWindowAnchor()
  }

  private func finish(_ result: Result<AppleSignInCredential, Error>) {
    continuation?.resume(with: result)
    continuation = nil
    controller = nil
  }
}
