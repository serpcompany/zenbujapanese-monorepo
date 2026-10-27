import packageJson from '../package.json' with { type: 'json' }
import { defaultEnvironment, type Environment, hosts } from './hosts.ts'
import { storeKey } from './key.ts'

export type Variant = 'release' | 'test'

export type ContentScript = { name: string; entry: string; matches: string[] }

export const minimumChromeVersion = '138'

export const extensionVersion: string = packageJson.version

const testPagesContentScript: ContentScript = {
  name: 'test-content-script',
  entry: 'test-pages/test-content-script.tsx',
  matches: ['http://localhost/*', 'http://127.0.0.1/*']
}

export const contentScriptFile = (script: ContentScript) => `${script.name}.js`

export function contentScripts(variant: Variant): ContentScript[] {
  return variant === 'test' ? [testPagesContentScript] : []
}

function onPages(scripts: ContentScript[]) {
  if (scripts.length === 0) return {}
  return {
    content_scripts: scripts.map(script => ({
      matches: script.matches,
      js: [contentScriptFile(script)],
      run_at: 'document_idle'
    })),
    web_accessible_resources: [
      { resources: ['assets/*.woff2'], matches: scripts.flatMap(script => script.matches) }
    ]
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
    action: { default_title: 'Zenbu Japanese' },
    side_panel: { default_path: 'pages/side-panel.html' },
    options_ui: { page: 'pages/settings.html', open_in_tab: true },
    background: { service_worker: 'service-worker.js', type: 'module' },
    permissions: ['offscreen', 'sidePanel', 'storage', 'activeTab'],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    ...onPages(contentScripts(variant))
  }
}
