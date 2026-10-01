# Zenbu Japanese

Zenbu Japanese is a family of products and resources for learning and using Japanese.

This monorepo is the main home for the Zenbu Japanese brand and the products and assets intended to work together over time, including the consumer-facing website, iPhone app, planned browser extensions, and future Zenbu Japanese experiences.

Today it holds the iPhone app and zenbujapanese.com, which publishes the app's dictionary on the web. The website runs the app's dictionary through a shared TypeScript core, which the app and the planned browser extensions will run too.

## Explore

- [Zenbu Japanese iPhone app](apps/ios/)
- [zenbujapanese.com](apps/web/), the website
- [Dictionary service](apps/dictionary-api/), which answers the website's dictionary pages
- [Shared dictionary core](packages/dictionary-core/)
- [Brand assets](assets/brand/)
- [Repository checks](tools/checks/), which `pnpm verify` runs: the [code rules](docs/agents/code.md) every change follows
- [Project issues and planned work](https://github.com/serpcompany/zenbujapanese-monorepo/issues)
- [Research and archived product exploration](https://github.com/zenbujapanese/research)
