export const settingsLabels = {
  title: 'Settings',
  pages: {
    readingAids: 'Reading Aids',
    frequencyDictionaries: 'Frequency Dictionaries',
    dictionaryData: 'Dictionary Data',
    sites: 'Sites',
    credits: 'Credits'
  },
  switches: {
    'readingAids.furigana': 'Furigana',
    'readingAids.furiganaHiddenOnKnownWords': 'Hide Furigana on Known Words',
    'readingAids.wordMeanings': 'Word Meanings',
    'readingAids.romaji': 'Romaji',
    'readingAids.translations': 'Sentence Translations',
    'videos.zenbuCaptions': 'Zenbu Captions',
    'crashReports.send': 'Send Crash Reports'
  },
  details: {
    'readingAids.furiganaHiddenOnKnownWords': 'Waits for Furigana to be on.',
    'readingAids.wordMeanings': "A short meaning under each word you haven't marked known.",
    'readingAids.translations': 'An English translation under each sentence.',
    'videos.zenbuCaptions': "On YouTube, Zenbu's captions in place of the site's.",
    'crashReports.send':
      "Sends the extension's and Chrome's versions, the computer's system, and where in the extension's code a problem happened to its developers through Sentry. Crash reports never include your searches, words, sentences, or the pages you read."
  },
  videos: 'Videos',
  crashReports: 'Crash Reports',
  frequency: {
    intro: 'The order leads the ranks in the word popup and Word Detail.',
    moveUp: (name: string) => `Move ${name} up`,
    moveDown: (name: string) => `Move ${name} down`
  },
  dictionaryData: {
    checking: 'Checking the dictionary…',
    release: 'Release',
    size: 'Size',
    lastChecked: 'Last checked',
    never: 'Never',
    checkForUpdates: 'Check for Updates'
  },
  site: {
    on: 'Zenbu is on for this site',
    off: 'Zenbu is off for this site',
    switchName: (host: string) => `Zenbu on ${host}`,
    thisPage: 'This page',
    unseen: {
      status: "Zenbu can't see this page",
      detail:
        "Chrome hides a page from Zenbu until its site access lets Zenbu in. To let Zenbu in, open Extensions in Chrome's toolbar, then Zenbu Japanese's menu, and change its site access."
    },
    'cant-run': {
      status: "Zenbu can't run here",
      detail: 'Chrome keeps every extension off its own pages and the Chrome Web Store.'
    },
    noAccess: "Chrome's site access keeps Zenbu off this site",
    allow: 'Allow on This Site'
  },
  menu: {
    open: 'Reading aids and settings',
    showWelcome: 'Show Welcome Tab'
  },
  sites: {
    intro: 'Zenbu is off on these sites.',
    none: 'Zenbu is on for every site it can run on.',
    turnOn: 'Turn On',
    turnOnFor: (host: string) => `Turn On ${host}`
  },
  credits: {
    title: 'Credits',
    credit: '{name}: {credit} {license}.',
    creditWithNotice: '{name}: {credit} {license}. {notice}'
  }
}
