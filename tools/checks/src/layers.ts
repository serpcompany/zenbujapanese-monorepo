import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { root } from './files'

export interface SwiftLayer {
  folder: string
  allowedImports: readonly string[]
}

export const swiftLayers: readonly SwiftLayer[] = [
  {
    folder: 'apps/ios/Modules/Sources/TranslatorCore/',
    allowedImports: ['Foundation', 'Observation', 'OSLog']
  },
  {
    folder: 'apps/ios/Modules/Sources/TranslatorOnDevice/',
    allowedImports: ['Foundation', 'AVFoundation', 'Speech', 'Translation', 'TranslatorCore']
  }
]

interface PlatformAPI {
  pattern: RegExp
  name: string
  use: string
}

export interface SwiftPlatforms {
  adapters: readonly string[]
  sharedCode: readonly string[]
  apis: readonly PlatformAPI[]
}

const adapter = 'an adapter in SearchExperience/Platform/'

export const swiftPlatforms: SwiftPlatforms = {
  adapters: ['apps/ios/Modules/Sources/SearchExperience/Platform/', 'apps/ios/UITests/Platform/'],
  sharedCode: [
    'apps/ios/Modules/Sources/',
    'apps/ios/Modules/Tests/',
    'apps/ios/App/',
    'apps/ios/UITests/'
  ],
  apis: [
    {
      pattern: /^\s*#(?:if|elseif)\b.*\b(?:os|canImport|targetEnvironment)\s*\(/,
      name: 'a platform condition',
      use: adapter
    },
    {
      pattern: /^\s*(?:@\w+\s+)*import\s+(?:UIKit|AppKit)\b/,
      name: 'UIKit or AppKit',
      use: adapter
    },
    { pattern: /\bUI[A-Z][A-Za-z]+\b/, name: 'a UIKit type', use: adapter },
    {
      pattern:
        /\bNS(?:Image|Color|Pasteboard|Workspace|Application|View|ViewRepresentable|ViewController|ViewControllerRepresentable|Window|Font|Event|Screen|Alert|OpenPanel|SavePanel|Menu|MenuItem|HostingView|HostingController|TextView|TextField|Button|Cursor|Responder|Appearance|BitmapImageRep|SharingService|StatusBar|Sound)\b/,
      name: 'an AppKit type',
      use: adapter
    },
    { pattern: /\bAVAudioSession\b/, name: 'AVAudioSession', use: 'ConversationAudioSession' },
    {
      pattern: /\bBG(?:TaskScheduler|AppRefreshTaskRequest)\b/,
      name: 'BackgroundTasks',
      use: 'BackgroundRefresh'
    },
    {
      pattern: /\bnavigationBarTitleDisplayMode\b/,
      name: 'navigationBarTitleDisplayMode',
      use: '.inlineNavigationTitle()'
    },
    {
      pattern: /\.topBar(?:Leading|Trailing)\b/,
      name: '.topBarLeading or .topBarTrailing',
      use: '.barLeading or .barTrailing'
    },
    { pattern: /\.insetGrouped\b/, name: '.insetGrouped', use: '.groupedList()' },
    {
      pattern: /\b(?:textInputAutocapitalization|keyboardType)\b/,
      name: 'textInputAutocapitalization or keyboardType',
      use: '.textEntry(_:)'
    },
    {
      pattern: /\btabViewBottomAccessory\b/,
      name: 'tabViewBottomAccessory',
      use: '.bottomAccessory(isEnabled:accessory:fallback:)'
    },
    {
      pattern: /\blistSectionSpacing\b/,
      name: 'listSectionSpacing',
      use: '.compactSectionSpacing() or .sectionSpacing(_:)'
    },
    { pattern: /\bnavigationBarDrawer\b/, name: 'navigationBarDrawer', use: '.alwaysShown' },
    {
      pattern: /\bsearchToolbarBehavior\b/,
      name: 'searchToolbarBehavior',
      use: '.minimizedSearchToolbar()'
    },
    {
      pattern: /\bEditButton\b|\\\.editMode\b|\bEditMode\b/,
      name: 'EditButton or editMode',
      use: 'ListEditButton, ListEditMode, .listEditMode(_:), and \\.isEditingList'
    },
    {
      pattern: /\.page\(indexDisplayMode|\bindexViewStyle\b/,
      name: 'the page tab view style',
      use: 'PagedView(selection:showsIndex:)'
    },
    { pattern: /for: \.tabBar\b/, name: 'the tab bar placement', use: '.tabBarVisibility(_:)' },
    {
      pattern: /\bsidebarAdaptable\b/,
      name: 'the sidebar-adaptable tab style',
      use: '.tabShell()'
    }
  ]
}

export interface LayerProblem {
  path: string
  line: number
  problem: string
}

const importedModule =
  /^\s*(?:@[\w.]+(?:\([^)]*\))?\s+)*(?:(?:public|package|internal|private|fileprivate)\s+)?import\s+(?:(?:typealias|struct|class|enum|protocol|let|var|func)\s+)?([A-Za-z_]\w*)/

const readRepositoryFile = (path: string) => readFileSync(join(root, path), 'utf8')

const isSwift = (path: string) => path.endsWith('.swift')

function importProblems(path: string, text: string, layer: SwiftLayer): LayerProblem[] {
  return text.split('\n').flatMap((line, index) => {
    const module = importedModule.exec(line)?.[1]
    if (!module || layer.allowedImports.includes(module)) return []
    return [
      {
        path,
        line: index + 1,
        problem: `imports ${module}; ${layer.folder} may import only ${layer.allowedImports.join(', ')}`
      }
    ]
  })
}

const appPart = (folder: string) => folder.split('/').slice(0, 3).join('/')

function adaptersFor(path: string, platforms: SwiftPlatforms): string {
  const [packageAdapters, ...others] = platforms.adapters
  return others.find(folder => path.startsWith(appPart(folder))) ?? packageAdapters ?? ''
}

function platformProblems(path: string, text: string, platforms: SwiftPlatforms): LayerProblem[] {
  const adapters = adaptersFor(path, platforms)
  return text.split('\n').flatMap((line, index) => {
    const api = platforms.apis.find(each => each.pattern.test(line))
    if (!api) return []
    return [
      {
        path,
        line: index + 1,
        problem: `uses ${api.name}, which differs between iPhone, iPad, and Mac; outside ${adapters}, use ${adapters === platforms.adapters[0] ? api.use : 'a helper there'}`
      }
    ]
  })
}

export function checkLayers(
  files: readonly string[],
  layers: readonly SwiftLayer[] = swiftLayers,
  read: (path: string) => string = readRepositoryFile,
  platforms: SwiftPlatforms = swiftPlatforms
): LayerProblem[] {
  return files.filter(isSwift).flatMap(path => {
    const layer = layers.find(each => path.startsWith(each.folder))
    const sharedAcrossPlatforms =
      platforms.sharedCode.some(folder => path.startsWith(folder)) &&
      !platforms.adapters.some(folder => path.startsWith(folder))
    if (!layer && !sharedAcrossPlatforms) return []
    const text = read(path)
    return [
      ...(layer ? importProblems(path, text, layer) : []),
      ...(sharedAcrossPlatforms ? platformProblems(path, text, platforms) : [])
    ]
  })
}
