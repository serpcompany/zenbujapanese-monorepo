// swift-tools-version: 6.2

import PackageDescription

let package = Package(
  name: "ZenbuJapaneseModules",
  platforms: [.iOS(.v26)],
  products: [
    .library(name: "LookupFeature", targets: ["LookupFeature"])
  ],
  targets: [
    .target(
      name: "LookupFeature",
      resources: [.process("Resources")],
      linkerSettings: [.linkedLibrary("sqlite3")]
    )
  ]
)
