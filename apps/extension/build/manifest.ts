export type Variant = 'release' | 'test'

export type ContentScript = { name: string; entry: string; matches: string[] }

export const minimumChromeVersion = '138'

export const extensionVersion = '0.1.0'

const testPagesContentScript: ContentScript = {
  name: 'test-content-script',
  entry: 'test-pages/test-content-script.tsx',
  matches: ['http://localhost/*', 'http://127.0.0.1/*']
}

export function contentScripts(variant: Variant): ContentScript[] {
  return variant === 'test' ? [testPagesContentScript] : []
}

function onPages(scripts: ContentScript[]) {
  if (scripts.length === 0) return {}
  return {
    content_scripts: scripts.map(script => ({
      matches: script.matches,
      js: [`${script.name}.js`],
      run_at: 'document_idle'
    })),
    web_accessible_resources: [
      { resources: ['assets/*.woff2'], matches: scripts.flatMap(script => script.matches) }
    ]
  }
}

export function manifest(variant: Variant) {
  return {
    manifest_version: 3,
    name: 'Zenbu Japanese',
    description: 'Look up Japanese words on any page.',
    version: extensionVersion,
    minimum_chrome_version: minimumChromeVersion,
    action: { default_title: 'Zenbu Japanese', default_popup: 'pages/popup.html' },
    side_panel: { default_path: 'pages/side-panel.html' },
    options_ui: { page: 'pages/settings.html', open_in_tab: true },
    background: { service_worker: 'service-worker.js', type: 'module' },
    permissions: ['offscreen', 'sidePanel'],
    ...onPages(contentScripts(variant))
  }
}
