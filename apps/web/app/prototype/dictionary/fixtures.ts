// Frozen illustrative design fixtures, not production ranking or corpus.
export type Word = {
  id: string
  word: string
  romaji: string
  common?: boolean
  rank?: number
  pitch?: { mora: string[]; high: boolean[]; drop: number }
  senses: { pos: string; meanings: string }[]
  note?: string
  example?: { ja: string; en: string }
}
export const words: Word[] = [
  {
    id: "1289400",
    word: "こんにちは",
    romaji: "konnichiwa",
    common: true,
    rank: 386,
    pitch: {
      mora: ["こ", "ん", "に", "ち", "は"],
      high: [false, true, true, true, true],
      drop: 0,
    },
    senses: [
      { pos: "Interjection", meanings: "hello; good day; good afternoon" },
    ],
    note: "A daytime greeting. は is pronounced わ. Also written 今日は.",
    example: { ja: "こんにちは。お元気ですか。", en: "Hello. How are you?" },
  },
  {
    id: "1012550",
    word: "もしもし",
    romaji: "moshimoshi",
    common: true,
    rank: 7928,
    pitch: {
      mora: ["も", "し", "も", "し"],
      high: [true, false, false, false],
      drop: 1,
    },
    senses: [
      { pos: "Interjection", meanings: "hello (on the telephone)" },
      {
        pos: "Interjection",
        meanings: "excuse me! (when calling out to someone)",
      },
    ],
    example: { ja: "もしもし、田中さんですか。", en: "Hello, is this Tanaka?" },
  },
  {
    id: "1096350",
    word: "ハロー",
    romaji: "harō",
    common: true,
    senses: [{ pos: "Interjection", meanings: "hello" }],
    note: "From English “hello”.",
  },
  {
    id: "1009000",
    word: "どうも",
    romaji: "dōmo",
    common: true,
    pitch: { mora: ["ど", "う", "も"], high: [true, false, false], drop: 1 },
    senses: [
      { pos: "Interjection", meanings: "thank you; thanks" },
      { pos: "Adverb", meanings: "quite; really; mostly" },
      { pos: "Interjection", meanings: "greetings; hello; goodbye" },
    ],
    example: { ja: "どうもありがとうございます。", en: "Thank you very much." },
  },
  {
    id: "2089490",
    word: "やあ",
    romaji: "yā",
    senses: [
      { pos: "Interjection", meanings: "hi!; hello there!" },
      { pos: "Interjection", meanings: "oh!; ah!" },
    ],
    note: "An informal greeting.",
  },
]
