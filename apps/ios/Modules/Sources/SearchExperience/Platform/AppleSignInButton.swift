import AuthenticationServices
import SwiftUI

#if os(macOS)
  typealias PlatformView = NSView
  typealias PlatformViewRepresentable = NSViewRepresentable
#else
  typealias PlatformView = UIView
  typealias PlatformViewRepresentable = UIViewRepresentable
#endif

struct AppleSignInButton: PlatformViewRepresentable {
  @Environment(\.colorScheme) private var colorScheme
  let type: ASAuthorizationAppleIDButton.ButtonType
  let action: () -> Void

  func makeCoordinator() -> Coordinator { Coordinator() }

  #if os(macOS)
    func makeNSView(context: Context) -> NSView { NSView() }

    func updateNSView(_ container: NSView, context: Context) {
      update(container, coordinator: context.coordinator)
    }
  #else
    func makeUIView(context: Context) -> UIView { UIView() }

    func updateUIView(_ container: UIView, context: Context) {
      update(container, coordinator: context.coordinator)
    }
  #endif

  private func update(_ container: PlatformView, coordinator: Coordinator) {
    let style: ASAuthorizationAppleIDButton.Style = colorScheme == .dark ? .white : .black
    coordinator.action = action
    guard coordinator.style != style else { return }
    coordinator.style = style
    container.subviews.forEach { $0.removeFromSuperview() }
    let button = ASAuthorizationAppleIDButton(
      authorizationButtonType: type, authorizationButtonStyle: style)
    button.cornerRadius = 10
    button.translatesAutoresizingMaskIntoConstraints = false
    #if os(macOS)
      button.target = coordinator
      button.action = #selector(Coordinator.tapped)
      button.setAccessibilityIdentifier("account.sign-in.apple")
    #else
      button.addTarget(coordinator, action: #selector(Coordinator.tapped), for: .touchUpInside)
      button.accessibilityIdentifier = "account.sign-in.apple"
    #endif
    container.addSubview(button)
    NSLayoutConstraint.activate([
      button.leadingAnchor.constraint(equalTo: container.leadingAnchor),
      button.trailingAnchor.constraint(equalTo: container.trailingAnchor),
      button.topAnchor.constraint(equalTo: container.topAnchor),
      button.bottomAnchor.constraint(equalTo: container.bottomAnchor),
    ])
  }

  @MainActor
  final class Coordinator: NSObject {
    var action: () -> Void = {}
    var style: ASAuthorizationAppleIDButton.Style?

    @objc func tapped() { action() }
  }
}
