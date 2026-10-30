import packageJson from '../package.json' with { type: 'json' }
import {
  defaultEnvironment,
  type Environment,
  hosts,
  hostsOf,
  type Variant,
  websitesOf
} from './hosts.ts'
import { storeKey } from './key.ts'

export type ContentScript = { name: string; entry: string; matches: string[]; world?: 'MAIN' }

export const minimumChromeVersion = '138'

export const extensionVersion: string = packageJson.version

export const iconSizes = [16, 32, 48, 128] as const

export const iconFile = (size: number) => `icons/icon-${size}.png`

const iconFiles = Object.fromEntries(iconSizes.map(size => [size, iconFile(size)]))

export const testAllowedSite = 'http://allowed.localhost'

const testPagesContentScript: ContentScript = {
  name: 'test-content-script',
  entry: 'test-pages/test-content-script.tsx',
  matches: ['http://localhost/*', 'http://127.0.0.1/*']
}

const pageLookupContentScript: ContentScript = {
  name: 'page-lookup',
  entry: 'src/content/page-lookup.ts',
  matches: []
}

const optionalSites = ['http://*/*', 'https://*/*']

const youTubeContentScript: ContentScript = {
  name: 'youtube',
  entry: 'src/content/youtube.ts',
  matches: ['https://www.youtube.com/*']
}

const netflixPages = ['https://www.netflix.com/*']

const netflixPlayerContentScript: ContentScript = {
  name: 'netflix-player',
  entry: 'src/content/netflix-player.ts',
  matches: netflixPages,
  world: 'MAIN'
}

const netflixContentScript: ContentScript = {
  name: 'netflix',
  entry: 'src/content/netflix.ts',
  matches: netflixPages
}

const videoContentScripts = [youTubeContentScript, netflixPlayerContentScript, netflixContentScript]

export const contentScriptFile = (script: ContentScript) => `${script.name}.js`

export function contentScripts(variant: Variant): ContentScript[] {
  return variant === 'test' ? [...videoContentScripts, testPagesContentScript] : videoContentScripts
}

export function builtContentScripts(variant: Variant): ContentScript[] {
  return [...contentScripts(variant), pageLookupContentScript]
}

function onPages(scripts: ContentScript[]) {
  return {
    content_scripts: scripts.map(script => ({
      matches: script.matches,
      js: [contentScriptFile(script)],
      run_at: script.world ? 'document_start' : 'document_idle',
      ...(script.world ? { world: script.world } : {})
    }))
  }
}

export function manifest(variant: Variant, environment: Environment = defaultEnvironment) {
  return {
    manifest_version: 3,
    name: 'Zenbu Japanese',
    description: 'Look up Japanese words on any page.',
    version: extensionVersion,
    key: storeKey,
    homepage_url: hosts[environment].website,
    minimum_chrome_version: minimumChromeVersion,
    icons: iconFiles,
    action: { default_title: 'Zenbu Japanese', default_icon: iconFiles },
    side_panel: { default_path: 'pages/side-panel.html' },
    options_ui: { page: 'pages/settings.html', open_in_tab: true },
    background: { service_worker: 'service-worker.js', type: 'module' },
    permissions: [
      'offscreen',
      'sidePanel',
      'storage',
      'activeTab',
      'unlimitedStorage',
      'alarms',
      'scripting',
      'declarativeNetRequestWithHostAccess',
      'identity'
    ],
    host_permissions: [
      `${hostsOf(variant, environment).languageData}/*`,
      `${hostsOf(variant, environment).api}/*`,
      'https://www.youtube.com/*',
      ...netflixPages,
      'https://*.oca.nflxvideo.net/*',
      ...(variant === 'test' ? [`${testAllowedSite}/*`] : [])
    ],
    optional_host_permissions: optionalSites,
    externally_connectable: {
      matches: websitesOf(variant, environment).map(website => `${website}/*`)
    },
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
    },
    ...onPages(contentScripts(variant))
  }
}
