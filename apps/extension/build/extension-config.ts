import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/postcss'
import { build, type InlineConfig, type Plugin, type UserConfig } from 'vite'
import { errorReportDefines } from './error-reports.ts'
import { defaultEnvironment, type Environment, hostDefines, type Variant } from './hosts.ts'
import {
  builtContentScripts,
  type ContentScript,
  extensionVersion,
  iconFile,
  iconSizes,
  manifest
} from './manifest.ts'
import { shadowSafeCss } from './shadow-safe-css.ts'

const packageFolder = fileURLToPath(new URL('..', import.meta.url))
const fromPackage = (path: string) => fileURLToPath(new URL(path, new URL('..', import.meta.url)))

const outputFolders: Record<Variant, string> = { release: 'dist', test: 'dist-test' }

const pages = ['side-panel', 'settings', 'welcome']

const offscreenDocument = 'offscreen/offscreen.html'

export const builtPages = [...pages.map(page => `pages/${page}.html`), offscreenDocument]

const isShadowRootStylesheet = (file: string) =>
  file.split('?')[0] === fromPackage('src/styles/shadow.css')

function extensionUrl(filename: string, { hostType }: { hostType: string }) {
  return hostType === 'js'
    ? { runtime: `chrome.runtime.getURL(${JSON.stringify(filename)})` }
    : { relative: true }
}

type RolldownOptions = NonNullable<NonNullable<UserConfig['build']>['rolldownOptions']>

const dropClientDirectives: NonNullable<RolldownOptions['onLog']> = (level, log, next) => {
  if (log.code !== 'MODULE_LEVEL_DIRECTIVE') next(level, log)
}

function shared(variant: Variant, environment: Environment): UserConfig {
  return {
    root: fromPackage('src'),
    base: './',
    publicDir: false,
    logLevel: 'warn',
    define: {
      ...hostDefines(environment, variant),
      ...errorReportDefines(extensionVersion, process.env)
    },
    css: {
      postcss: {
        plugins: [tailwindcss({ base: packageFolder }), shadowSafeCss(isShadowRootStylesheet)]
      }
    },
    build: {
      outDir: fromPackage(outputFolders[variant]),
      assetsInlineLimit: 0,
      chunkSizeWarningLimit: 2048,
      sourcemap: 'hidden'
    }
  }
}

function contentScriptBuild(
  variant: Variant,
  environment: Environment,
  script: ContentScript
): InlineConfig {
  const base = shared(variant, environment)
  return {
    ...base,
    configFile: false,
    experimental: { renderBuiltUrl: extensionUrl },
    build: {
      ...base.build,
      emptyOutDir: false,
      rolldownOptions: {
        onLog: dropClientDirectives,
        input: { [script.name]: fromPackage(script.entry) },
        output: { format: 'iife', entryFileNames: '[name].js' }
      }
    }
  }
}

function extensionFiles(variant: Variant, environment: Environment): Plugin {
  return {
    name: 'zenbu-extension-files',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: `${JSON.stringify(manifest(variant, environment), null, 2)}\n`
      })
    },
    async buildStart() {
      for (const size of iconSizes) {
        this.emitFile({
          type: 'asset',
          fileName: iconFile(size),
          source: await readFile(fromPackage(`../../assets/brand/extensions/icon-${size}.png`))
        })
      }
    },
    async closeBundle() {
      for (const script of builtContentScripts(variant)) {
        await build(contentScriptBuild(variant, environment, script))
      }
    }
  }
}

export function extensionConfig(
  variant: Variant,
  environment: Environment = defaultEnvironment
): UserConfig {
  const base = shared(variant, environment)
  return {
    ...base,
    plugins: [extensionFiles(variant, environment)],
    worker: { format: 'es' },
    build: {
      ...base.build,
      emptyOutDir: true,
      rolldownOptions: {
        onLog: dropClientDirectives,
        input: {
          ...Object.fromEntries(pages.map(page => [page, fromPackage(`src/pages/${page}.html`)])),
          offscreen: fromPackage(`src/${offscreenDocument}`),
          'service-worker': fromPackage('src/service-worker/service-worker.ts')
        },
        output: {
          entryFileNames: chunk =>
            chunk.name === 'service-worker' ? 'service-worker.js' : 'assets/[name]-[hash].js'
        }
      }
    }
  }
}
