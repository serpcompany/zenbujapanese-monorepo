// swift-tools-version: 6.2

import PackageDescription

let package = Package(
  name: "ZenbuJapaneseModules",
  platforms: [.iOS(.v26)],
  products: [
    .library(name: "SearchExperience", targets: ["SearchExperience"])
  ],
  dependencies: [
    .package(
      url: "https://github.com/iasnezhkov/sudachi-swift.git",
      exact: "0.1.1"
    ),
    .package(
      url: "https://github.com/weichsel/ZIPFoundation.git",
      exact: "0.9.20"
    ),
  ],
  targets: [
    .target(
      name: "SearchExperience",
      dependencies: [
        .product(name: "Sudachi", package: "sudachi-swift"),
        .product(name: "ZIPFoundation", package: "ZIPFoundation"),
      ],
      resources: [.process("Resources")],
      linkerSettings: [.linkedLibrary("sqlite3")]
    ),
    .testTarget(
      name: "SearchExperienceTests",
      dependencies: ["SearchExperience"],
      linkerSettings: [.linkedLibrary("sqlite3")]
    ),
  ]
)
