import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/postcss'
import { build, type InlineConfig, type Plugin, type UserConfig } from 'vite'
import { type ContentScript, contentScripts, manifest, type Variant } from './manifest.ts'
import { shadowSafeCss } from './shadow-safe-css.ts'

const packageFolder = fileURLToPath(new URL('..', import.meta.url))
const fromPackage = (path: string) => fileURLToPath(new URL(path, new URL('..', import.meta.url)))

const outputFolders: Record<Variant, string> = { release: 'dist', test: 'dist-test' }

const pages = ['side-panel', 'popup', 'settings']

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

function shared(variant: Variant): UserConfig {
  return {
    root: fromPackage('src'),
    base: './',
    publicDir: false,
    logLevel: 'warn',
    css: {
      postcss: {
        plugins: [tailwindcss({ base: packageFolder }), shadowSafeCss(isShadowRootStylesheet)]
      }
    },
    experimental: { renderBuiltUrl: extensionUrl },
    build: {
      outDir: fromPackage(outputFolders[variant]),
      assetsInlineLimit: 0,
      chunkSizeWarningLimit: 2048
    }
  }
}

function contentScriptBuild(variant: Variant, script: ContentScript): InlineConfig {
  const base = shared(variant)
  return {
    ...base,
    configFile: false,
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

function extensionFiles(variant: Variant): Plugin {
  return {
    name: 'zenbu-extension-files',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: `${JSON.stringify(manifest(variant), null, 2)}\n`
      })
    },
    async closeBundle() {
      for (const script of contentScripts(variant)) {
        await build(contentScriptBuild(variant, script))
      }
    }
  }
}

export function extensionConfig(variant: Variant): UserConfig {
  const base = shared(variant)
  return {
    ...base,
    plugins: [extensionFiles(variant)],
    worker: { format: 'es' },
    build: {
      ...base.build,
      emptyOutDir: true,
      rolldownOptions: {
        onLog: dropClientDirectives,
        input: {
          ...Object.fromEntries(pages.map(page => [page, fromPackage(`src/pages/${page}.html`)])),
          offscreen: fromPackage('src/offscreen/offscreen.html'),
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
