export const commentRule = [
  'Code has no comments, with no exceptions (docs/agents/code.md, No comments):',
  '- Say it in the code: name the value, function, type, or test for what it means, and move a step that needs explaining into a function named for it.',
  "- Put why it's built this way, and how the parts fit together, in the doc AGENTS.md routes to for that code.",
  '- Configure a tool in its config file instead of a directive (biome-ignore, @ts-expect-error, noqa, shellcheck disable), or change the code so it needs none.',
  '- Delete commented-out code: git history keeps it.'
].join('\n')

export const unclassifiedRule =
  "The comment check doesn't know these files' language. Add each extension or name to tools/checks/src/files.ts: as code (with its comment syntax), prose or data, written by a tool, or third-party."

export const docsRule =
  "Docs are the map agents work from (docs/agents/code.md, Docs): every link, heading anchor, repository path, and pnpm script in them exists, AGENTS.md reaches every doc, each skill is described and listed, and nothing is hidden in an HTML comment. Fix or remove what's named; link a new doc from the doc that routes to its area."

export const sizeRule =
  'Code files stay under the line limit (docs/agents/code.md, File size). Split a file that outgrows it by responsibility, into files named for what each does. An exception needs a reason that makes splitting unsafe now; it goes in knownLargeFiles in tools/checks/src/sizes.ts with its size and that reason, and may only shrink.'

export const layerRule =
  "A layer imports only what ARCHITECTURE.md (Layers) lets it: tools/checks/src/layers.ts lists each Swift layer's folder and allowed imports. Move the code that needs the framework into the app target, behind one of the layer's clients, rather than widening the list. The app's Swift builds for iPhone, iPad, and Mac (ADR 0015): only SearchExperience/Platform/ may use #if os(...), UIKit, AppKit, or an API one platform lacks, so call the adapter or view extension the finding names, or add one there."

export const linterRule =
  'ShellCheck, actionlint, and Ruff run at the versions in tools/checks/src/linters.ts, in Docker, locally and in CI (docs/agents/code.md, Checks). Fix what they report. Without Docker, an installed copy runs instead; with neither, the linter is skipped here and still runs in CI.'

export const secretRule =
  'A credential in the repository is readable by everyone with access, and git history keeps it after a fix (docs/agents/code.md, Secrets). Remove it, have whoever issued it rotate it, and read it from the environment instead: a Wrangler secret, a GitHub Actions secret, or a gitignored .dev.vars or .env. For a test value that only looks like a credential, use one that does not.'

export const duplicateRule =
  'Code says a thing once (docs/agents/code.md, Duplicate code): move what the repeated blocks share into one function, type, or test helper named for what it does, and call it from each place. Test setup counts too: share a fixture or a builder.'

export const deadCodeRule =
  "Nothing unused stays (docs/agents/code.md, Dead code): delete an unused file, dependency, or export, and stop exporting what only its own file uses. Knip finds them from each package's entry points; when it misses a real entry point (a file a tool or runtime loads by name), name it in knip.json."

export const dependencyRule =
  'Imports point one way inside each part, and parts meet only where ARCHITECTURE.md says (docs/agents/code.md, Imports). Each finding above says where the code belongs.'
