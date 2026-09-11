# Zenbu Japanese

This repository is the shared home of the Zenbu Japanese product family. It keeps related delivery surfaces, canonical domain language, architectural decisions, and shared app-owned data together while each delivery surface remains independently buildable, versioned, and releasable.

## Current delivery surfaces

- [Zenbu Japanese iOS App](apps/ios/README.md) is the only delivery surface currently implemented in this repository.
- Website and web Product Experiences, browser extensions, Android, and additional Apple-platform products receive their own `apps/<surface>/` root only after that product is approved. Empty placeholder apps are not created in advance.

## Repository ownership

| Path | Owner and boundary |
| --- | --- |
| `apps/<surface>/` | One delivery surface. It owns its platform toolchain, dependencies, build entry points, operational documentation, versioning, metadata, signing, deployment, and release process. |
| `assets/` | Product-family source assets that are not runtime inputs of one app. Runtime assets remain with their consuming app. |
| `docs/` | Canonical cross-product domain documentation, ADRs, and repository-agent guidance. App-specific operational truth stays under the owning app. |
| `packages/<name>/` | A versioned shared artifact with at least two real consumers. This directory remains absent until that threshold is met. |

One Git repository does not imply one build graph. Do not add a root package manager or monorepo orchestrator until multiple real delivery surfaces create measured coordination work that justifies one. A Shared Capability also does not imply shared runtime or UI source: platform-native implementations may share a documented contract without sharing executable code. Cross-platform APIs and data formats must be versioned and backward-compatible because web and app-store deployments cannot be atomic.

## Shared context

- [Domain language](CONTEXT.md)
- [Architectural decisions](docs/adr/)
- [Product-family monorepo decision](docs/adr/0005-keep-a-lightweight-product-family-monorepo.md)
- [Exploratory research and archived evidence](https://github.com/zenbujapanese/research)

Repository extraction is reconsidered only when a persistent access, compliance, ownership, product, tooling, release-stability, or independently versioned platform boundary is measured.
