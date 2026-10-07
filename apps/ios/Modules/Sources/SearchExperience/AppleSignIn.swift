import AuthenticationServices
import UIKit

struct AppleSignInCredential: Sendable {
  let identityToken: String
  let authorizationCode: String
}

@MainActor
final class AppleSignIn: NSObject, ASAuthorizationControllerDelegate,
  ASAuthorizationControllerPresentationContextProviding
{
  private var continuation: CheckedContinuation<AppleSignInCredential, Error>?
  private var controller: ASAuthorizationController?

  static func credential(nonce: String) async throws -> AppleSignInCredential {
    let signIn = AppleSignIn()
    return try await signIn.perform(hashedNonce: Data(nonce.utf8).sha256)
  }

  private func perform(hashedNonce: String) async throws -> AppleSignInCredential {
    let request = ASAuthorizationAppleIDProvider().createRequest()
    request.requestedScopes = [.email]
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
    finish(.success(AppleSignInCredential(identityToken: token, authorizationCode: code)))
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
