# Repository map

Zenbu Japanese is a product-family monorepo with one implemented delivery surface: the iOS app under `apps/ios/`.

| Path | Responsibility |
| --- | --- |
| `apps/ios/App/` | iOS application target and bundled app resources |
| `apps/ios/Modules/` | Swift package containing the app's feature implementation |
| `apps/ios/LanguageData/` | Pinned language-data sources and generated app-owned artifacts |
| `apps/ios/Tools/` | Language-data import and iOS build-preparation tools |
| `apps/ios/metadata/` | Canonical App Store metadata |
| `apps/ios/docs/product/` | Current user-facing iOS behavior |
| `assets/brand/` | Shared Zenbu artwork and prepared platform exports |
| `docs/adr/` | Accepted durable architectural decisions |
| `docs/agents/` | Task-specific instructions reached through `AGENTS.md` |

Create another `apps/<surface>/` only when that delivery surface is approved and implemented. Create a shared package only after at least two real consumers need the same versioned artifact. Exploratory research and archived evidence belong in the private [`zenbujapanese/research`](https://github.com/zenbujapanese/research) repository.
