# Zenbu Japanese

This repository is the shared home of the Zenbu Japanese product family. It keeps canonical product language, research, architectural decisions, contracts, provenance, and cross-product evidence together while each delivery surface remains independently buildable, testable, versioned, and releasable.

## Current delivery surfaces

- [Zenbu Japanese iOS App](apps/ios/README.md) is the only delivery surface currently implemented in this repository.
- Website and web Product Experiences, browser extensions, Android, and additional Apple-platform products receive their own `apps/<surface>/` root only after that product is approved. Empty placeholder apps are not created in advance.

## Repository ownership

| Path | Owner and boundary |
| --- | --- |
| `apps/<surface>/` | One delivery surface. It owns its platform toolchain, dependencies, build and test entry points, operational documentation, versioning, metadata, signing, deployment, and release process. |
| `assets/` | Product-family source assets that are not runtime inputs of one app. Runtime assets remain with their consuming app. |
| `docs/` | Canonical cross-product domain documentation, ADRs, research, and provenance. App-specific operational truth stays under the owning app. |
| `.github/workflows/` | Flat workflow files with delivery-surface-owned routing. New or renamed workflows use a clear product prefix, keep an always-created scope or aggregate gate, and conditionally run expensive work for affected consumers. |
| `packages/<name>/` | A versioned shared artifact with at least two real consumers. This directory remains absent until that threshold is met. |

One Git repository does not imply one build graph. Do not add a root package manager or monorepo orchestrator until multiple real delivery surfaces create measured coordination work that justifies one. A Shared Capability also does not imply shared runtime or UI source: platform-native implementations may share a documented contract without sharing executable code. Cross-platform APIs and data formats must be versioned and backward-compatible because web and app-store deployments cannot be atomic.

The existing `.github/workflows/jmdict-upstream-check.yml` name predates the product-prefix convention. Renaming it is deferred because its path is referenced by iOS language-data policy and CI-scope tests; that change requires its own audited migration rather than an untested documentation cleanup.

## Shared context

- [Domain language](CONTEXT.md)
- [Architectural decisions](docs/adr/)
- [Product-family repository topology research](docs/research/engineering/product-family-repository-topology-2026-09-11.md)

Repository extraction is reconsidered only when a persistent access, compliance, ownership, product, tooling, release-stability, or independently versioned platform boundary is measured. The research report records those triggers and the rejected speculative structures.
