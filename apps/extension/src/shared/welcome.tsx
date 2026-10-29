import { Button } from '@zenbu/ui/components/button'
import logo from '../../../../assets/brand/vector/zenbu-icon-flat-vector.svg'
import type { DataState } from './data-state'
import { DictionaryProgress, type ReadData, useDataState } from './dictionary-progress'
import { EverySite } from './every-site'
import { labels } from './labels'
import {
  chromeModel,
  ModelNotice,
  type ModelServices,
  useTranslationModel
} from './translation-model'

const translationText = {
  asks: labels.welcome.translationOffer,
  ready: labels.welcome.translationReady
}

type WelcomeProps = { read?: ReadData; check?: ReadData; translation?: ModelServices }

export function Welcome({ read, check, translation = chromeModel }: WelcomeProps) {
  const [data, again] = useDataState({ read, check })
  const shown: DataState = data ?? { state: 'checking' }
  const { model, download } = useTranslationModel(true, translation)
  return (
    <main className="mx-auto flex w-full max-w-[600px] flex-col items-center gap-8 px-4 py-16 text-center">
      <img src={logo} alt="" className="size-14" />
      <section data-welcome-state={shown.state} className="flex w-full flex-col items-center gap-4">
        <h1 className="font-heading text-2xl font-semibold">{labels.welcome.title}</h1>
        <DictionaryProgress data={shown} />
        {shown.state === 'failed' && <Button onClick={again}>{labels.welcome.tryAgain}</Button>}
        <ModelNotice model={model} download={download} text={translationText} stacked />
      </section>
      <section className="flex w-full flex-col gap-3 text-left">
        <h2 className="font-heading text-base font-semibold">{labels.welcome.firstSteps}</h2>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
          {labels.welcome.steps.map(step => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <EverySite />
      </section>
    </main>
  )
}
