import type { Failure } from '../shared/messages'
import {
  type Direction,
  type Language,
  type TranslationAnswer,
  type TranslationRequest,
  type TranslatorState,
  translate
} from '../translation/messages'
import { downloadTranslator } from '../translation/translator'
import { readSelection } from './selection'

export type TranslateServices = {
  translate(request: TranslationRequest): Promise<TranslationAnswer | Failure>
  download(direction: Direction, onProgress: (fraction: number) => void): Promise<TranslatorState>
  readSelection(): Promise<string | null>
  copy(text: string): Promise<void>
  speak(text: string, language: Language): void
}

const voiceLanguages: Record<Language, string> = { ja: 'ja-JP', en: 'en-US' }

function speak(text: string, language: Language) {
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = voiceLanguages[language]
  speechSynthesis.cancel()
  speechSynthesis.speak(utterance)
}

export const onDeviceServices: TranslateServices = {
  translate: request => translate(request),
  download: downloadTranslator,
  readSelection,
  copy: text => navigator.clipboard.writeText(text),
  speak
}
