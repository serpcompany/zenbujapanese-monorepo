// swift-tools-version: 6.2

import PackageDescription

let package = Package(
  name: "TranslateReplay",
  platforms: [.macOS(.v26)],
  products: [
    .executable(name: "translate-replay", targets: ["TranslateReplay"])
  ],
  dependencies: [
    .package(path: "../../Modules")
  ],
  targets: [
    .executableTarget(
      name: "TranslateReplay",
      dependencies: [.product(name: "TranslatorOnDevice", package: "Modules")]
    ),
    .testTarget(
      name: "TranslateReplayTests",
      dependencies: ["TranslateReplay"]
    ),
  ]
)
