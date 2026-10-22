import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
  private let label = UILabel()
  private var link: URL?

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground
    label.numberOfLines = 0
    label.accessibilityIdentifier = "shareResult"
    let open = UIButton(type: .system, primaryAction: UIAction(title: "Watch in Spike") { [weak self] _ in
      self?.openInApp()
    })
    let done = UIButton(type: .system, primaryAction: UIAction(title: "Done") { [weak self] _ in
      self?.extensionContext?.completeRequest(returningItems: nil)
    })
    let stack = UIStackView(arrangedSubviews: [label, open, done])
    stack.axis = .vertical
    stack.spacing = 16
    stack.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(stack)
    NSLayoutConstraint.activate([
      stack.leadingAnchor.constraint(equalTo: view.layoutMarginsGuide.leadingAnchor),
      stack.trailingAnchor.constraint(equalTo: view.layoutMarginsGuide.trailingAnchor),
      stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 24),
    ])
    let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
    guard let provider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.url.identifier) })
    else {
      label.text = "No URL shared"
      return
    }
    provider.loadItem(forTypeIdentifier: UTType.url.identifier) { [weak self] item, _ in
      let url = item as? URL
      DispatchQueue.main.async {
        self?.link = url
        self?.label.text = "Shared: \(url?.absoluteString ?? "nil")"
      }
    }
  }

  private func openInApp() {
    let scheme = (Bundle.main.bundleIdentifier ?? "").replacingOccurrences(of: ".share", with: "").lowercased()
    var components = URLComponents()
    components.scheme = scheme
    components.host = "watch"
    components.queryItems = [URLQueryItem(name: "link", value: link?.absoluteString ?? "")]
    guard let target = components.url else { return }
    extensionContext?.open(target) { [weak self] opened in
      DispatchQueue.main.async {
        self?.label.text = (self?.label.text ?? "") + "\nNSExtensionContext.open: \(opened)"
      }
    }
  }
}
