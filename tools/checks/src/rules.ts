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
  'Docs are the map agents work from (docs/agents/code.md, Docs): every link and repository path in them exists, and AGENTS.md reaches every doc. Fix or remove the link or path; link a new doc from the doc that routes to its area.'

export const sizeRule =
  'Code files stay under the line limit (docs/agents/code.md, File size). Split a file that outgrows it by responsibility, into files named for what each does. There are no exceptions without a reason that makes splitting unsafe now; the only ones, Swift files nothing here can build or test, are listed in tools/checks/src/sizes.ts with their size and reason, and may only shrink.'

export const layerRule =
  "A layer imports only what ARCHITECTURE.md (Layers) lets it: tools/checks/src/layers.ts lists each Swift layer's folder and allowed imports. Move the code that needs the framework into the app target, behind one of the layer's clients, rather than widening the list."

export const linterRule =
  'ShellCheck, actionlint, and Ruff run at the versions in tools/checks/src/linters.ts, in Docker, locally and in CI (docs/agents/code.md, Checks). Fix what they report. Without Docker, an installed copy runs instead; with neither, the linter is skipped here and still runs in CI.'
