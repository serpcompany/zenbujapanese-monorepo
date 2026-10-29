import { PronounceButton } from '@zenbu/ui/dictionary/pronounce-button'
import { vi } from 'vitest'

export const cantPronounce = "This browser can't pronounce Japanese."

export function speakerWithOnlyANetworkVoice() {
  const googleJapanese = {
    name: 'Google 日本語',
    voiceURI: 'Google 日本語',
    lang: 'ja-JP',
    localService: false
  }
  const spoken = vi.fn()
  const said = vi.fn()
  vi.stubGlobal('speechSynthesis', {
    cancel: vi.fn(),
    speak: spoken,
    getVoices: () => [googleJapanese],
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  })
  vi.stubGlobal('SpeechSynthesisUtterance', class {})
  const speaker = (
    <PronounceButton
      text="テーブル"
      label="Pronounce テーブル"
      unsupported={cantPronounce}
      onUnsupported={said}
    />
  )
  return { speaker, spoken, said }
}
