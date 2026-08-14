// swift-tools-version: 6.2

import PackageDescription

let package = Package(
  name: "ZenbuJapaneseModules",
  platforms: [.iOS(.v26)],
  products: [
    .library(name: "SearchExperience", targets: ["SearchExperience"])
  ],
  targets: [
    .target(
      name: "SearchExperience",
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
