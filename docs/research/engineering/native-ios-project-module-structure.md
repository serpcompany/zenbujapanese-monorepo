# Native iOS project and module structure research

Research supporting the Wayfinder decision [Choose the native iOS project and module structure](https://github.com/serpcompany/zenbujapanese-monorepo/issues/15). Consulted 2026-08-01.

## Decision context

- Zenbu Japanese is one installed iPhone app with three initial **Product Experiences**: Lookup, Translator, and Media Library. The app shell coordinates routing and composition without taking ownership of Product Experience histories or records. See the resolutions of [Fix the initial MVP Product Experience boundary](https://github.com/serpcompany/zenbujapanese-monorepo/issues/2) and [Establish the cross-product ownership rules](https://github.com/serpcompany/zenbujapanese-monorepo/issues/3).
- The eight initial **Shared Capabilities** are app-owned contracts, explicitly not commitments to eight packages or custom implementations. Product Experiences must depend on app-owned models and capability interfaces rather than provider schemas. See [Inventory the MVP Shared Capabilities and their contracts](https://github.com/serpcompany/zenbujapanese-monorepo/issues/4) and [ADR 0001](../../adr/0001-language-capability-boundaries.md).
- The first implementation targets iPhone and iOS 26 or later. See [Define the supported Apple platform and device baseline](https://github.com/serpcompany/zenbujapanese-monorepo/issues/16).

## Primary-source findings

### Local Swift packages are Apple's supported lightweight modularity mechanism

Apple recommends organizing an app modularly with local Swift packages to improve maintenance and reuse. A local package remains in the same repository as its app and can contain library products, targets, tests, and resources. This supports compile-time seams without requiring separately versioned repositories. Sources: [Organizing your code with local packages](https://developer.apple.com/documentation/Xcode/organizing-your-code-with-local-packages), [Creating Swift Packages](https://developer.apple.com/videos/play/wwdc2019/410/), and [PackageDescription](https://developer.apple.com/documentation/packagedescription).

### A SwiftPM target is a module-sized compilation and test boundary

Swift Package Manager compiles each regular target into a module and each test target into a test suite. Targets may depend on other targets in the same package and on products from package dependencies, so the package manifest can express and enforce an acyclic dependency graph. Sources: [PackageDescription.Target](https://developer.apple.com/documentation/packagedescription/target) and [Swift Package Manager PackageDescription](https://docs.swift.org/package-manager/PackageDescription/PackageDescription.html).

### Products are the package surface exposed to the app project

A package product is an externally visible build artifact assembled from one or more targets. The app project only needs to link the package products it consumes; targets that are implementation details need not become separate products. Source: [PackageDescription.Product](https://developer.apple.com/documentation/packagedescription/product).

### Resources and unit tests can remain with their owner

SwiftPM targets explicitly support resources, and test targets can depend directly on the module they verify. This permits Product Experience assets, fixtures, and unit tests to live beside the owning implementation while the app target retains app-level resources and UI tests. Sources: [PackageDescription](https://developer.apple.com/documentation/packagedescription) and [PackageDescription.Target](https://developer.apple.com/documentation/packagedescription/target).

### Filesystem-backed Xcode folders reduce project-file churn

Apple documents that filesystem-backed folders keep the Project navigator aligned with disk, automatically reflect file changes, and minimize project-file edits and merge conflicts. Source: [Managing files and folders in your Xcode project](https://developer.apple.com/documentation/xcode/managing-files-and-folders-in-your-xcode-project).

## Skill discovery and review

Searches used `npx skills find` for iOS/Swift architecture, SwiftPM modularization, Xcode project structure, Swift testing, and project generation.

### Strong candidate: `swift-architecture`

- Package: `dpearson2699/swift-ios-skills@swift-architecture`
- Discovery signal: 1.8K installs; the source repository had 950 GitHub stars when checked.
- Relevance: directly covers module boundaries, dependency direction, state ownership, injected dependencies, and architecture-level test seams.
- Useful guidance: choose the smallest structure justified by observed pressure; default new SwiftUI features to simple MV-style state ownership; add stricter patterns only for concrete complexity; avoid forwarding-only layers and speculative protocols.
- Install command if wanted later: `npx skills add dpearson2699/swift-ios-skills@swift-architecture -g -y`
- Sources: [skills.sh listing](https://skills.sh/dpearson2699/swift-ios-skills/swift-architecture), [source repository](https://github.com/dpearson2699/swift-ios-skills), and [skill source](https://github.com/dpearson2699/swift-ios-skills/blob/main/skills/swift-architecture/SKILL.md).

### Useful later: `swift-testing`

- Package: `dpearson2699/swift-ios-skills@swift-testing`
- Discovery signal: 3K installs from the same 950-star Swift/iOS skill repository.
- Relevance: useful when the separate testing-strategy decision chooses test syntax, fixtures, and coverage; it does not answer the current module-graph decision by itself.
- Install command if wanted later: `npx skills add dpearson2699/swift-ios-skills@swift-testing -g -y`
- Sources: [skills.sh listing](https://skills.sh/dpearson2699/swift-ios-skills/swift-testing) and [source repository](https://github.com/dpearson2699/swift-ios-skills).

### Useful after code exists: `spm-build-analysis`

- Package: `avdlee/xcode-build-optimization-agent-skill@spm-build-analysis`
- Discovery signal: 2.8K installs; the source repository had 1,191 GitHub stars when checked.
- Relevance: audits a real SwiftPM dependency graph for cycles, oversized modules, hidden umbrella dependencies, duplicated compilation, and build-cost regressions. It is evidence-driven and therefore better applied after the initial graph and build timings exist.
- Install command if wanted later: `npx skills add avdlee/xcode-build-optimization-agent-skill@spm-build-analysis -g -y`
- Sources: [skills.sh listing](https://skills.sh/avdlee/xcode-build-optimization-agent-skill/spm-build-analysis), [source repository](https://github.com/AvdLee/Xcode-Build-Optimization-Agent-Skill), and [skill source](https://github.com/AvdLee/Xcode-Build-Optimization-Agent-Skill/blob/main/skills/spm-build-analysis/SKILL.md).

### Not recommended for this decision: `xcode-project-setup`

- Package: `firebase/agent-skills@xcode-project-setup`
- Discovery signal: 76.9K installs from Firebase's official agent-skills repository.
- Reason to defer: it automates adding remote Swift packages and Firebase configuration to an existing Xcode project. It does not determine product-aligned module boundaries and is too dependency-installation-specific for the present question.
- Sources: [skills.sh listing](https://skills.sh/firebase/agent-skills/xcode-project-setup), [source repository](https://github.com/firebase/agent-skills), and [skill source](https://github.com/firebase/agent-skills/blob/main/skills/xcode-project-setup/SKILL.md).

### Project generators are not yet justified

The search found official Tuist skills, but their purpose is operating or migrating to generated projects. The current repository has one app, one platform target, no existing Xcode project, and no demonstrated project-file scaling problem. Introducing a generator now would add another tool and manifest before a concrete need exists. Revisit only if project maintenance or target count becomes costly. Source: [Tuist skills](https://skills.sh/tuist/agent-skills/using-tuist-generated-projects).

## Recommendation for Zenbu Japanese

Use a deliberately small, native structure:

1. Put the native product under `apps/ios/`. Keep one checked-in Xcode project there with one production app target as the composition root and one app-level UI-test target. Use filesystem-backed folders for the app target.
2. Keep modular iOS source in one local Swift package under the same `apps/ios/` subtree initially. Use SwiftPM targets—not separate repositories or one package per concept—as the compile-time ownership boundaries.
3. Create targets only for code that exists and has a settled owner. Start with Product Experience targets for Lookup, Translator, and Media Library. Add a Cross-Product Flow target when the Image Text Flow is implemented. Do not create targets for deferred Product Experiences.
4. Introduce a Shared Capability target when a settled capability acquires an implemented contract or multiple real consumers. Do not pre-create eight empty capability targets. Keep each provider or Apple-framework adapter behind its capability's app-owned interface and wire concrete adapters only in the app composition root.
5. Pair every package target containing behavior with a focused test target. Keep target-owned resources and fixtures beside that target; keep app icons, launch assets, app configuration, and end-to-end UI tests with the app target.
6. Enforce dependency direction: app composition root -> Product Experiences, Cross-Product Flows, and concrete adapters; Product Experiences and Cross-Product Flows -> Shared Capability interfaces; concrete adapters -> their app-owned capability contracts; Shared Capabilities never depend on Product Experiences or the app shell; Product Experiences never import another Product Experience's implementation.
7. Avoid a generic `Core`, `Common`, or `Utilities` dumping-ground target. Extract shared code only when a stable, named responsibility and real consumers justify a module.
8. Begin with SwiftUI's direct state ownership and dependency injection. Do not commit the whole app to TCA, Clean Architecture, MVVM, or a coordinator framework before concrete workflow complexity demonstrates the need.

This recommendation enforces the already-settled ownership rules while keeping package and target count proportional to code that actually exists.

## Monorepo considerations

The repository is expected to house other delivery surfaces such as a website, web app, or browser extension. That changes the repository boundary, but not the native module graph.

### Decide now

- Treat each delivery surface as an independently buildable app under `apps/<surface>/`, beginning with `apps/ios/`. The iOS Xcode project, local Swift package, assets, fixtures, and platform configuration remain inside that subtree.
- Reserve top-level `packages/` for artifacts with at least two real consumers. A possible future shape is `packages/<named-contract-or-data>/`, but no empty cross-platform packages should be created now.
- Keep canonical domain language and product decisions at the repository level (`CONTEXT.md`, `docs/product/`, and `docs/adr/`) because they govern every delivery surface even when implementations differ.
- Distinguish a **Shared Capability** from shared source code. A capability is a product contract; its iOS and web implementations may legitimately differ. Cross-platform reuse requires a separately justified artifact rather than moving Swift code or provider schemas into a generic shared folder.
- Give each app its own native dependency manager and build entry point. SwiftPM should own the iOS dependency graph; a future web workspace may use its own JavaScript package manager. Root automation may orchestrate those builds without forcing one tool to model every platform.
- Use stable repository-relative entry points so later CI can target changed surfaces, for example `apps/ios`, while cross-platform documentation and future shared packages can intentionally trigger multiple pipelines. Exact CI filters belong to the separate automation decision.

### Defer until a second consumer exists

- A cross-platform schema or code-generation pipeline.
- Sharing persistence models, networking clients, UI modules, or provider adapters across delivery surfaces.
- A repository-wide build system such as Bazel, Buck2, Nx, or Turborepo.
- Extracting local Swift packages into standalone repositories or remotely versioned packages.
- A universal design-token, localization, or content package. These may become valuable, but their consumer requirements and toolchains need to be observed first.

### Proposed initial repository shape

```text
/
├── apps/
│   └── ios/
│       ├── ZenbuJapanese.xcodeproj
│       ├── App/
│       ├── AppUITests/
│       └── Modules/
│           ├── Package.swift
│           ├── Sources/
│           └── Tests/
├── docs/
├── CONTEXT.md
└── packages/                 # absent until a real cross-platform artifact exists
```

This shape preserves a clean future path to `apps/web/` or `apps/browser-extension/` without making the first iOS implementation pay for hypothetical source sharing.

## Cross-platform framework consideration

Cross-platform compilation is relevant to the repository's long-term platform strategy, but it does not change the recommendation for the current native-iOS foundation.

- Electron shares a JavaScript/HTML/CSS application across macOS, Windows, and Linux desktop. It does not target iOS or produce a browser extension from the same application artifact. Source: [Electron introduction](https://www.electronjs.org/docs/latest/).
- Flutter supports iOS, Android, web, and desktop deployments from one framework, but each deployment remains a distinct platform build with its own support matrix. Source: [Flutter supported deployment platforms](https://docs.flutter.dev/reference/supported-platforms).
- Capacitor is explicitly web-first: it packages a web application in native iOS and Android containers and exposes native features through plugins. That is attractive when the web UI is authoritative, but Zenbu's settled first implementation is native iOS and depends heavily on camera, OCR, speech, audio routing, permissions, local persistence, and Apple-device verification. Source: [Capacitor documentation](https://capacitorjs.com/docs).
- React Native primarily targets iOS and Android; macOS and other destinations are separately maintained out-of-tree platforms. It therefore does not erase platform ownership or make browser-extension delivery automatic. Source: [React Native macOS introduction](https://microsoft.github.io/react-native-macos/docs/intro).
- Kotlin Multiplatform can share selected business logic while retaining SwiftUI on iOS, or share UI through Compose Multiplatform. Its official guidance supports starting with an isolated piece of genuinely common logic rather than forcing the whole application through one abstraction. Sources: [Kotlin Multiplatform](https://kotlinlang.org/multiplatform/) and [sharing code across platforms](https://kotlinlang.org/docs/multiplatform/multiplatform-share-on-platforms.html).

### Result

Keep the first app native Swift and SwiftUI. Preserve future portability through stable product contracts, provider-independent data models, provenance rules, test fixtures, and repository boundaries—not by selecting a cross-platform UI runtime before another platform is approved. If Android, desktop, or a web application later becomes a concrete destination, evaluate cross-platform technology against that destination pair and the implementation then available. Browser extensions and content-oriented websites should be expected to have platform-specific presentation even when they eventually share datasets, schemas, or evaluation fixtures.
