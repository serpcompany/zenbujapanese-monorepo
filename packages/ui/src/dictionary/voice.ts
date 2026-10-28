export type Voice = Pick<SpeechSynthesisVoice, 'name' | 'voiceURI' | 'lang' | 'localService'>

const qualityMarks = [/premium|プレミアム/i, /enhanced|拡張/i]
const eloquenceVoice = /^(eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley)\b|\.eloquence\./i
const qualities = qualityMarks.length + 2

const localeOf = (lang: string) => lang.toLowerCase().replace('_', '-')
const languageOf = (lang: string) => localeOf(lang).split('-')[0]

function quality(voice: Voice) {
  const named = `${voice.name} ${voice.voiceURI}`
  const marked = qualityMarks.findIndex(mark => mark.test(named))
  if (marked !== -1) return marked
  return eloquenceVoice.test(named) ? qualityMarks.length + 1 : qualityMarks.length
}

export function bestLocalVoice<V extends Voice>(voices: readonly V[], lang: string): V | null {
  const locale = localeOf(lang)
  const language = languageOf(lang)
  const rank = (voice: V) => (localeOf(voice.lang) === locale ? 0 : qualities) + quality(voice)
  return voices
    .filter(voice => voice.localService && languageOf(voice.lang) === language)
    .reduce<V | null>(
      (best, voice) => (best === null || rank(voice) < rank(best) ? voice : best),
      null
    )
}
