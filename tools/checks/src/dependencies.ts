import { join } from 'node:path'
import { cruise, type IForbiddenRuleType } from 'dependency-cruiser'
import extractTSConfig from 'dependency-cruiser/config-utl/extract-ts-config'
import { root } from './files'

export interface Part {
  folder: string
  sources: string[]
  testCode: string
  rules: IForbiddenRuleType[]
}

const outsideThePart = '^\\.\\./'

export function reachableFrom(entries: string[], testCode: string) {
  return {
    name: 'every-module-is-used',
    severity: 'error',
    comment:
      "This module isn't reachable from the part's entry points, so nothing runs it: delete it, import it where it's needed, or, if only tests use it, move it beside them (docs/agents/code.md, Checks).",
    from: { path: entries, pathNot: testCode },
    to: {
      path: '^src/',
      pathNot: [testCode, '\\.d\\.ts$', '\\.css$', ...entries],
      reachable: false
    }
  } satisfies IForbiddenRuleType
}

function runtimeImportsNoDevDependency(runtime: string, notRuntime: string) {
  return {
    name: 'runtime-imports-no-dev-dependency',
    severity: 'error',
    comment:
      "Code that runs in production imports a devDependency, which a production install doesn't have. Move the package to dependencies, or import only its types.",
    from: { path: runtime, pathNot: notRuntime },
    to: { dependencyTypes: ['npm-dev'], dependencyTypesNot: ['type-only'] }
  } satisfies IForbiddenRuleType
}

function neverImports(name: string, folder: string, comment: string) {
  return {
    name,
    severity: 'error',
    comment,
    from: {},
    to: { path: `^\\.\\./${folder}/` }
  } satisfies IForbiddenRuleType
}

const coreByName = {
  name: 'core-by-package-name',
  severity: 'error',
  comment:
    'Apps reach a shared package through its name, such as @zenbu/dictionary-core or @zenbu/node-service, never a relative path into packages/ (ARCHITECTURE.md, Layers).',
  from: {},
  to: { path: '^\\.\\./\\.\\./packages/', dependencyTypes: ['local'] }
} satisfies IForbiddenRuleType

const webTestCode = '(\\.test\\.tsx?$|^e2e/|^src/test/)'
const nextRouteFiles =
  '^src/app/(|.*/)(page|layout|route|not-found|error|global-error|loading|template|default|sitemap|robots|manifest|icon|opengraph-image)\\.tsx?$'

const web: Part = {
  folder: 'apps/web',
  sources: ['src', 'worker.ts', 'e2e'],
  testCode: webTestCode,
  rules: [
    reachableFrom([nextRouteFiles, '^worker\\.ts$'], webTestCode),
    runtimeImportsNoDevDependency('^(src/|worker\\.ts$)', webTestCode),
    coreByName,
    neverImports(
      'web-never-imports-the-service',
      'dictionary-api',
      'The website reaches the dictionary service only over HTTP, through src/lib/dictionary/api.ts, and shares row shapes through the core (ARCHITECTURE.md, Layers).'
    ),
    neverImports(
      'web-never-imports-the-account-service',
      'account-api',
      'The website reaches the account service only over HTTP, through its /v1 API (ARCHITECTURE.md, Layers).'
    ),
    {
      name: 'worker-runs-before-nextjs',
      severity: 'error',
      comment:
        'worker.ts runs before Next.js on every request, so nothing it imports, however indirectly, may load Next.js or React (docs/agents/web.md, Code layout). Keep what it needs in src/lib, free of both.',
      from: { path: '^worker\\.ts$' },
      to: { path: '(^|/)node_modules/(next|react|react-dom|server-only)/', reachable: true }
    },
    {
      name: 'only-data-reads-the-service',
      severity: 'error',
      comment:
        'Pages read the dictionary service only through src/lib/dictionary/data.ts; only src/lib/dictionary/retired.ts, which worker.ts runs before Next.js, calls the client too (docs/agents/web.md, Code layout). Add a function to data.ts instead.',
      from: {
        path: '^(src/|worker\\.ts$)',
        pathNot: ['^src/lib/dictionary/(data|retired)\\.ts$', webTestCode]
      },
      to: { path: '^src/lib/dictionary/api\\.ts$' }
    },
    {
      name: 'lib-builds-on-nothing-above-it',
      severity: 'error',
      comment:
        'src/lib holds the data and logic that components, hooks, and routes build on, so it never imports them (docs/agents/web.md, Code layout). Move what both sides need into src/lib.',
      from: { path: '^src/lib/', pathNot: webTestCode },
      to: { path: '^src/(components|hooks|app)/' }
    },
    {
      name: 'components-never-import-routes',
      severity: 'error',
      comment:
        'Routes (src/app) import components and hooks, never the reverse (docs/agents/web.md, Code layout). Pass what a component needs from its route as a prop, or move shared code into src/lib.',
      from: { path: '^src/(components|hooks)/', pathNot: webTestCode },
      to: { path: '^src/app/' }
    }
  ]
}

const serviceTestCode = '(\\.test\\.ts$|^src/conformance/)'

const service: Part = {
  folder: 'apps/dictionary-api',
  sources: ['src', 'scripts'],
  testCode: serviceTestCode,
  rules: [
    reachableFrom(
      ['^src/server\\.ts$', '^src/worker\\.ts$', '^src/worker-dev\\.mjs$'],
      serviceTestCode
    ),
    runtimeImportsNoDevDependency('^src/', `${serviceTestCode}|^src/worker-dev\\.mjs$`),
    coreByName,
    neverImports(
      'service-never-imports-the-website',
      'web',
      'The dictionary service knows nothing of the website: they share row shapes through the core, and the website calls the service over HTTP (ARCHITECTURE.md, Layers).'
    ),
    neverImports(
      'service-never-imports-the-account-service',
      'account-api',
      'The dictionary service checks an account only through the account service, over HTTP and its JWKS (ADR 0012), never by importing it (ARCHITECTURE.md, Layers).'
    )
  ]
}

const accountTestCode = '\\.test\\.ts$'

const account: Part = {
  folder: 'apps/account-api',
  sources: ['src', 'scripts'],
  testCode: accountTestCode,
  rules: [
    reachableFrom(['^src/server\\.ts$'], accountTestCode),
    runtimeImportsNoDevDependency('^src/', accountTestCode),
    coreByName,
    neverImports(
      'account-service-never-imports-another-app',
      '(web|dictionary-api)',
      'The account service knows nothing of the website or the dictionary service: they call it over HTTP (ARCHITECTURE.md, Layers).'
    )
  ]
}

const nodeServiceTestCode = '(\\.test\\.ts$|^src/test/)'

const nodeService: Part = {
  folder: 'packages/node-service',
  sources: ['src'],
  testCode: nodeServiceTestCode,
  rules: [
    runtimeImportsNoDevDependency('^src/', nodeServiceTestCode),
    {
      name: 'node-service-imports-no-app',
      severity: 'error',
      comment:
        'What the Node services share imports none of them and no repository tool (ARCHITECTURE.md, Layers). Pass what it needs in as a parameter.',
      from: {},
      to: { path: '^\\.\\./\\.\\./(apps|tools)/' }
    }
  ]
}

const coreTestCode = '\\.test\\.ts$'

const core: Part = {
  folder: 'packages/dictionary-core',
  sources: ['src'],
  testCode: coreTestCode,
  rules: [
    {
      name: 'core-needs-no-runtime',
      severity: 'error',
      comment:
        'The core imports no runtime, framework, or package: a client passes in its database, files, and capabilities (ARCHITECTURE.md, Layers). Take what this needs as a parameter, or import only types.',
      from: { path: '^src/', pathNot: coreTestCode },
      to: {
        dependencyTypes: ['core', 'npm', 'npm-dev', 'npm-optional', 'npm-peer', 'npm-no-pkg'],
        dependencyTypesNot: ['type-only']
      }
    },
    {
      name: 'core-imports-no-client',
      severity: 'error',
      comment:
        'The core is shared by every client, so it imports none of them and no repository tool (ARCHITECTURE.md, Layers). Move what it needs into the core, or pass it in.',
      from: {},
      to: { path: '^\\.\\./\\.\\./(apps|tools)/' }
    }
  ]
}

const checksTestCode = '(\\.test\\.ts$|^src/agents/)'

const checks: Part = {
  folder: 'tools/checks',
  sources: ['src'],
  testCode: checksTestCode,
  rules: [reachableFrom(['^src/(cli|hook|report|fix-branch)\\.ts$'], checksTestCode)]
}

export const parts: readonly Part[] = [web, service, account, core, nodeService, checks]

function sharedRules(part: Part): IForbiddenRuleType[] {
  return [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'These modules import each other, so neither can be read or tested alone. Move what both need into a module of its own, which each imports (docs/agents/code.md, Checks).',
      from: {},
      to: { circular: true }
    },
    {
      name: 'production-imports-no-test',
      severity: 'error',
      comment:
        'Code that runs in production imports a test or test support, which ships test code and couples the two. Move what both need beside the production code, and keep test support where only tests import it.',
      from: { pathNot: part.testCode },
      to: { path: part.testCode }
    }
  ]
}

async function inFolder<T>(folder: string, run: () => Promise<T>): Promise<T> {
  const previous = process.cwd()
  process.chdir(folder)
  try {
    return await run()
  } finally {
    process.chdir(previous)
  }
}

export async function checkDependencies(part: Part): Promise<string[]> {
  const baseDir = join(root, part.folder)
  const tsConfigFile = join(baseDir, 'tsconfig.json')
  const result = await inFolder(baseDir, () =>
    cruise(
      part.sources,
      {
        baseDir,
        validate: true,
        ruleSet: { forbidden: [...sharedRules(part), ...part.rules] },
        outputType: 'err-long',
        tsPreCompilationDeps: true,
        tsConfig: { fileName: tsConfigFile },
        doNotFollow: { path: `(^|/)node_modules/|${outsideThePart}` },
        exclude: { path: '^(\\.open-next|\\.next|\\.wrangler|dist|node_modules)/' },
        enhancedResolveOptions: {
          exportsFields: ['exports'],
          conditionNames: ['import', 'require', 'node', 'default', 'types'],
          extensions: ['.ts', '.tsx', '.mts', '.js', '.mjs', '.cjs', '.json']
        }
      },
      undefined,
      { tsConfig: extractTSConfig(tsConfigFile) }
    )
  )
  if (result.exitCode === 0) return []
  const report = typeof result.output === 'string' ? result.output : JSON.stringify(result.output)
  return report
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line && !/^\s*-$/.test(line))
    .map(line => line.replace(/^(\s*)(error|warn|info) /, `$1${part.folder}: `))
}
