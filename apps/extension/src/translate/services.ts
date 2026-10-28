import { lookUpPopupCard, segmentText } from '../shared/dictionary'
import type { Failure } from '../shared/messages'
import {
  type Direction,
  type Language,
  type TranslationAnswer,
  type TranslationRequest,
  type TranslatorState,
  translate
} from '../translation/messages'
import { downloadTranslator, translatorAvailability } from '../translation/translator'
import { readSelection } from './selection'
import type { SourceServices } from './source-words'
import { onDeviceSpeech } from './speech'

export type TranslateServices = SourceServices & {
  translate(request: TranslationRequest): Promise<TranslationAnswer | Failure>
  availability(direction: Direction): Promise<TranslatorState>
  download(direction: Direction, onProgress: (fraction: number) => void): Promise<TranslatorState>
  readSelection(): Promise<string | null>
  copy(text: string): Promise<void>
  localVoice(language: Language): string | null
  watchVoices(onChange: () => void): () => void
  speak(text: string, language: Language): void
}

export const onDeviceServices: TranslateServices = {
  translate: request => translate(request),
  availability: translatorAvailability,
  download: downloadTranslator,
  readSelection,
  copy: text => navigator.clipboard.writeText(text),
  segment: text => segmentText(text),
  popupCard: (languageReferenceID, frequency) => lookUpPopupCard(languageReferenceID, frequency),
  ...onDeviceSpeech
}
