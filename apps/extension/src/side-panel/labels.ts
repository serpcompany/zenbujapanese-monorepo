export const labels = {
  tryAgain: 'Try again',
  tabBar: 'Side panel tabs',
  backTo: (tab: string) => `Back to ${tab}`,
  tabs: {
    video: 'Video',
    translate: 'Translate',
    images: 'Images',
    words: 'Words',
    recent: 'Recent'
  },
  empty: {
    video: {
      title: 'No video on this tab',
      description: 'Play a video with Japanese captions, and its transcript shows here.'
    },
    translate: {
      title: 'Nothing to translate yet',
      description: 'Japanese or English you translate shows here.'
    },
    images: { title: 'Reading text in pictures is coming soon' },
    words: {
      title: 'No words yet',
      description: 'A Zenbu account keeps your known words, lists and notes on all your devices.'
    },
    recent: {
      title: 'No recent videos',
      description: 'A Zenbu account keeps the videos you watch on all your devices.'
    }
  },
  signUp: 'Sign up or sign in',
  placeholder: {
    word: 'Word',
    kanji: 'Kanji',
    form: 'Form'
  },
  testPage: {
    title: 'Test page',
    openAnother: 'Open a page over this one'
  }
}
