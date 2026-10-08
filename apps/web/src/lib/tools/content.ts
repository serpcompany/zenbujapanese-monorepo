import type { Question } from '@/lib/questions'
import type { ConverterPair } from './converters'
import type { ConverterSlug } from './paths'
import type { WidthOptions } from './width'

export type Phrase = string | { japanese: string } | { latin: string }
export type RichText = readonly Phrase[]

const phraseText = (phrase: Phrase) =>
  typeof phrase === 'string' ? phrase : 'japanese' in phrase ? phrase.japanese : phrase.latin

export const plainText = (text: RichText) => text.map(phraseText).join('')

export function withKeys(text: RichText) {
  const seen = new Map<string, number>()
  return text.map(phrase => {
    const content = phraseText(phrase)
    const count = (seen.get(content) ?? 0) + 1
    seen.set(content, count)
    return { key: `${content}#${count}`, phrase }
  })
}

const ja = (japanese: string) => ({ japanese })
const latin = (text: string) => ({ latin: text })

export const howItWorks: Record<ConverterSlug, readonly RichText[]> = {
  'hiragana-to-katakana': [
    [
      'Each hiragana has one katakana partner: ',
      ja('か'),
      ' becomes ',
      ja('カ'),
      ', ',
      ja('しゃ'),
      ' becomes ',
      ja('シャ'),
      ', and small kana stay small. The long-vowel mark ',
      ja('ー'),
      ' belongs to both, so it carries over.'
    ],
    [
      'Katakana mostly writes words from other languages, like ',
      ja('コーヒー'),
      ' (coffee) and ',
      ja('スマートフォン'),
      ' (smartphone), and names from outside Japan.'
    ]
  ],
  'katakana-to-hiragana': [
    [
      'Each katakana has one hiragana partner: ',
      ja('カ'),
      ' becomes ',
      ja('か'),
      ', ',
      ja('シャ'),
      ' becomes ',
      ja('しゃ'),
      ', and small kana stay small. The long-vowel mark ',
      ja('ー'),
      ' belongs to both, so it carries over. ',
      ja('ヷ'),
      ' to ',
      ja('ヺ'),
      ' have no hiragana, so they stay as they are.'
    ],
    [
      'Hiragana is how a learner reads a word aloud, so turning ',
      ja('コーヒー'),
      ' into ',
      ja('こーひー'),
      ' shows its sounds in the script you learned first.'
    ]
  ],
  'romaji-to-kana': [
    [
      'Type Japanese sounds in Latin letters and each syllable turns into kana as soon as it’s complete: ',
      latin('ka'),
      ' becomes ',
      ja('か'),
      ', ',
      latin('kya'),
      ' becomes ',
      ja('きゃ'),
      '. Letters that can’t start a syllable yet wait for the next one.'
    ],
    [
      'Choose hiragana for Japanese words and katakana for words from other languages. A hyphen types the long mark, so ',
      latin('ko-hi-'),
      ' becomes ',
      ja('コーヒー'),
      ' in katakana.'
    ]
  ],
  'kana-to-romaji': [
    [
      'Each kana becomes its Hepburn spelling, the one on signs and in most textbooks: ',
      ja('し'),
      ' is ',
      latin('shi'),
      ', ',
      ja('つ'),
      ' is ',
      latin('tsu'),
      ', and ',
      ja('ふ'),
      ' is ',
      latin('fu'),
      '. Katakana works the same way.'
    ],
    [
      'Long vowels are spelled as they’re written: ',
      ja('とうきょう'),
      ' is ',
      latin('toukyou'),
      ', and ',
      ja('ー'),
      ' repeats the vowel before it, so ',
      ja('コーヒー'),
      ' is ',
      latin('koohii'),
      '. Kana has no spaces between words, so neither does the romaji, and kanji stay as they are.'
    ]
  ],
  'half-width-to-full-width': [
    [
      'Half-width characters are narrow versions from early computers that showed one byte per character. Each becomes its standard full-width form: ',
      ja('ｶ'),
      ' becomes ',
      ja('カ'),
      ', and ',
      latin('A'),
      ' becomes ',
      ja('Ａ'),
      '.'
    ],
    [
      'A voiced half-width kana is two characters, the kana and a separate mark (',
      ja('ｶﾞ'),
      '). They join into one (',
      ja('ガ'),
      ').'
    ]
  ],
  'full-width-to-half-width': [
    [
      'Each full-width character becomes its narrow form: ',
      ja('カ'),
      ' becomes ',
      ja('ｶ'),
      ', and ',
      ja('Ａ'),
      ' becomes ',
      latin('A'),
      '. A voiced kana splits into two characters, ',
      ja('ガ'),
      ' into ',
      ja('ｶﾞ'),
      '.'
    ],
    ['Hiragana and kanji have no half-width form, so they stay as they are.']
  ]
}

export const questions: Record<ConverterPair, readonly Question[]> = {
  kana: [
    {
      question: 'Does it change kanji or letters?',
      answer:
        'No. Only kana change. Kanji, Latin letters, numbers, and punctuation stay as they are, so you can paste a whole sentence.'
    },
    {
      question: 'What happens to the long mark ー?',
      answer:
        'Hiragana and katakana share it, so it carries over unchanged. コーヒー becomes こーひー, which is how a learner would read it.'
    },
    {
      question: 'When is katakana used?',
      answer:
        'Mostly for words borrowed from other languages, like コーヒー (coffee), for names from outside Japan, and for emphasis, as italics are in English.'
    }
  ],
  romaji: [
    {
      question: 'How do I type ん?',
      answer:
        'Type n before a consonant or at the end of a word, where nn works too. Before a vowel or y, type n’ so it isn’t read as な or にゃ: kin’en gives きんえん, while kinen gives きねん.'
    },
    {
      question: 'How do I type a small っ?',
      answer: 'Double the consonant after it: kitte gives きって, and matcha gives まっちゃ.'
    },
    {
      question: 'Which romanization does it use?',
      answer:
        'Hepburn, the spelling on signs, maps, and most textbooks: し is shi, つ is tsu, and ふ is fu. It also accepts the other common spellings when you type, such as si, tu, and hu.'
    }
  ],
  width: [
    {
      question: 'What is half-width katakana?',
      answer:
        'A narrow form of katakana from early computers that could only show one byte per character. It still turns up on receipts, bank statements, and old systems.'
    },
    {
      question: 'Why do forms ask for full-width?',
      answer:
        'Many Japanese forms check for full-width (全角) characters, especially in name and address fields, and reject half-width ones.'
    },
    {
      question: 'Does it change hiragana?',
      answer: 'No. Hiragana has no half-width form, so it stays as it is either way.'
    }
  ]
}

export interface SpellingRule {
  label: string
  rule: string
  examples: readonly (readonly [from: string, to: string])[]
  note?: string
}

export const typingTips: readonly SpellingRule[] = [
  {
    label: 'ん',
    rule: 'n before a consonant or at the end, where nn works too; n’ before a vowel or y',
    examples: [
      ['onna', 'おんな'],
      ["kin'en", 'きんえん']
    ]
  },
  { label: 'ん before b or p', rule: 'm works too', examples: [['shimbun', 'しんぶん']] },
  {
    label: 'Small っ',
    rule: 'Double the consonant',
    examples: [
      ['kitte', 'きって'],
      ['matcha', 'まっちゃ']
    ]
  },
  { label: 'Long mark ー', rule: 'A hyphen', examples: [['ko-hi-', 'こーひー']] },
  {
    label: 'Small kana',
    rule: 'x or l first',
    examples: [
      ['xa', 'ぁ'],
      ['ltu', 'っ']
    ]
  },
  { label: 'を', rule: 'wo', examples: [['wo', 'を']], note: 'the particle' },
  {
    label: 'Punctuation',
    rule: 'Type it as usual',
    examples: [
      ['.', '。'],
      [',', '、'],
      ['[', '「'],
      [']', '」']
    ]
  }
]

export const spellingRules: readonly SpellingRule[] = [
  {
    label: 'Small っ',
    rule: 'Doubles the next consonant',
    examples: [
      ['きって', 'kitte'],
      ['まっちゃ', 'matcha']
    ]
  },
  {
    label: 'ん before a vowel or y',
    rule: 'Gets an apostrophe',
    examples: [
      ['きんえん', "kin'en"],
      ['しんよう', "shin'you"]
    ]
  },
  { label: 'Long vowels', rule: 'Spelled as written', examples: [['とうきょう', 'toukyou']] },
  { label: 'ー in katakana', rule: 'Repeats the vowel', examples: [['コーヒー', 'koohii']] },
  { label: 'を', rule: 'Spelled o', examples: [['を', 'o']], note: 'as Hepburn writes it' },
  { label: 'Kanji', rule: 'Stay as they are', examples: [], note: 'only kana have a spelling' }
]

export interface WidthRow {
  kind: string
  half: string
  full: string
  change: keyof WidthOptions | null
  note?: string
}

export const widthRows: readonly WidthRow[] = [
  { kind: 'Katakana', half: 'ｶﾀｶﾅ', full: 'カタカナ', change: 'katakana' },
  {
    kind: 'Voiced kana',
    half: 'ｶﾞ ﾊﾟ',
    full: 'ガ パ',
    change: 'katakana',
    note: 'Two half-width characters join into one.'
  },
  { kind: 'Letters', half: 'ABC abc', full: 'ＡＢＣ ａｂｃ', change: 'lettersAndNumbers' },
  { kind: 'Numbers', half: '123', full: '１２３', change: 'lettersAndNumbers' },
  { kind: 'Punctuation', half: '｡､｢｣', full: '。、「」', change: 'symbolsAndSpaces' },
  {
    kind: 'Space',
    half: ' ',
    full: '　',
    change: 'symbolsAndSpaces',
    note: 'A narrow space becomes a wide one.'
  },
  {
    kind: 'Hiragana',
    half: 'ひらがな',
    full: 'ひらがな',
    change: null,
    note: 'It has no half-width form, so it stays as it is.'
  }
]
