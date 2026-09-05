export type DictionaryResult = {
  id: string
  headword: string
  reading: string
  romanization: string
  meanings: string[]
  partsOfSpeech: string[]
  common: boolean
  frequency: number | null
  pitch: { morae: string[]; dropAfter: number | null } | null
  example: { japanese: string; english: string } | null
}

export const bestMatches: DictionaryResult[] = [
  {
    id: "1289400",
    headword: "こんにちは",
    reading: "こんにちは",
    romanization: "konnichiwa",
    meanings: ["hello", "good day", "good afternoon"],
    partsOfSpeech: ["Interjection"],
    common: true,
    frequency: 386,
    pitch: { morae: ["こ", "ん", "に", "ち", "は"], dropAfter: 0 },
    example: { japanese: "こんにちは、お元気ですか。", english: "Hello, how are you?" },
  },
  {
    id: "1012550",
    headword: "もしもし",
    reading: "もしもし",
    romanization: "moshimoshi",
    meanings: ["hello (on the telephone)", "excuse me! (when calling out)"],
    partsOfSpeech: ["Interjection"],
    common: true,
    frequency: 7928,
    pitch: { morae: ["も", "し", "も", "し"], dropAfter: 1 },
    example: { japanese: "もしもし、田中さんですか。", english: "Hello, is this Mr. Tanaka?" },
  },
]

export const additionalMatches: DictionaryResult[] = [
  {
    id: "1096350",
    headword: "ハロー",
    reading: "ハロー",
    romanization: "harō",
    meanings: ["hello", "hallo", "hullo"],
    partsOfSpeech: ["Interjection"],
    common: true,
    frequency: null,
    pitch: null,
    example: null,
  },
  {
    id: "2089490",
    headword: "やあ",
    reading: "やあ",
    romanization: "yā",
    meanings: ["hi!", "hello there!", "yo!"],
    partsOfSpeech: ["Interjection"],
    common: false,
    frequency: 2300,
    pitch: { morae: ["や", "あ"], dropAfter: 1 },
    example: { japanese: "やあ、久しぶり。", english: "Hey, long time no see." },
  },
  {
    id: "1009000",
    headword: "どうも",
    reading: "どうも",
    romanization: "dōmo",
    meanings: ["thanks", "hello", "somehow; for some reason"],
    partsOfSpeech: ["Interjection", "Adverb"],
    common: true,
    frequency: 800,
    pitch: { morae: ["ど", "う", "も"], dropAfter: 1 },
    example: null,
  },
]

export const allResults = [...bestMatches, ...additionalMatches]
