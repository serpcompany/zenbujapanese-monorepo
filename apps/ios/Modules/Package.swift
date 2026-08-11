// swift-tools-version: 6.2

import PackageDescription

let package = Package(
  name: "ZenbuJapaneseModules",
  platforms: [.iOS(.v26)],
  products: [
    .library(name: "LookupReplica", targets: ["LookupReplica"])
  ],
  targets: [
    .target(
      name: "LookupReplica",
      resources: [.process("Resources")],
      linkerSettings: [.linkedLibrary("sqlite3")]
    )
  ]
)
