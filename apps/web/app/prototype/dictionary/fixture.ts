export type DictionaryResult = {
  id: string
  headword: string
  reading: string
  romaji: string
  common: boolean
  partsOfSpeech: string[]
  meanings: string[]
  frequencyRank: number | null
  pitch: string | null
  example: { japanese: string; english: string } | null
}

// PROTOTYPE — frozen display fixtures for issue #295. No runtime data access.
export const results: DictionaryResult[] = [
  {
    id: "1289400",
    headword: "今日は",
    reading: "こんにちは",
    romaji: "konnichiwa",
    common: true,
    partsOfSpeech: ["Interjection"],
    meanings: ["hello", "good day", "good afternoon"],
    frequencyRank: 386,
    pitch: "こꜛんにちは",
    example: { japanese: "こんにちは、今日はいい天気ですね。", english: "Hello, the weather is nice today." },
  },
  {
    id: "1012550",
    headword: "もしもし",
    reading: "もしもし",
    romaji: "moshimoshi",
    common: true,
    partsOfSpeech: ["Interjection"],
    meanings: ["hello (on the phone)", "excuse me! (when calling out)"],
    frequencyRank: 7928,
    pitch: "もꜛしもし",
    example: { japanese: "もしもし、田中さんですか。", english: "Hello, is this Mr. Tanaka?" },
  },
  {
    id: "1096350",
    headword: "ハロー",
    reading: "ハロー",
    romaji: "harō",
    common: true,
    partsOfSpeech: ["Interjection"],
    meanings: ["hello"],
    frequencyRank: null,
    pitch: "ハꜛロー",
    example: null,
  },
  {
    id: "1009000",
    headword: "どうも",
    reading: "どうも",
    romaji: "dōmo",
    common: true,
    partsOfSpeech: ["Interjection", "Adverb"],
    meanings: ["thanks", "quite; really", "greetings; hello; goodbye"],
    frequencyRank: 800,
    pitch: "どꜛうも",
    example: { japanese: "どうも、はじめまして。", english: "Hello, nice to meet you." },
  },
  {
    id: "1004620",
    headword: "ちわ",
    reading: "ちわ",
    romaji: "chiwa",
    common: false,
    partsOfSpeech: ["Interjection", "Colloquial", "Abbreviation"],
    meanings: ["hello; hi"],
    frequencyRank: null,
    pitch: "ちꜛわ",
    example: null,
  },
]

export const bestMatches = results.slice(0, 2)
export const additionalMatches = results.slice(2)
export const selectedEntry = results[0]
