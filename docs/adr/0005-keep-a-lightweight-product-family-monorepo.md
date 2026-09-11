---
status: accepted
---

# Keep a lightweight product-family monorepo

Zenbu will keep related delivery surfaces in one repository while they share meaningful
product or data changes. Each delivery surface exists only when implemented, lives under
`apps/<surface>/`, and owns its platform toolchain, dependencies, operational documentation,
metadata, signing, and releases. One repository does not require one build, test, dependency,
or release graph.

Shared packages are added only after at least two real consumers need the same versioned
artifact. A delivery surface moves to another repository only when a persistent, material
boundary makes that safer or simpler, such as different access or compliance requirements,
independent ownership, repeated release interference, repository-performance cost, or a
separately versioned product. The supporting point-in-time research is archived in the
private [`zenbujapanese/research`](https://github.com/zenbujapanese/research/blob/main/engineering/product-family-repository-topology-2026-09-11.md)
repository.
