import { Button } from '@zenbu/ui/components/button'
import logo from '../assets/zenbu-icon.svg'
import { type AskData, DataStatus, useDataState } from './data-status'
import { labels } from './labels'

export function Welcome({ ask }: { ask?: AskData }) {
  const { data, update } = useDataState(ask)
  return (
    <main className="mx-auto flex w-full max-w-[600px] flex-col items-center gap-8 px-4 py-16 text-center">
      <img src={logo} alt="" className="size-14" />
      <section data-welcome-state={data.state} className="flex w-full flex-col items-center gap-4">
        <h1 className="font-heading text-2xl font-semibold">{labels.welcome.title}</h1>
        <DataStatus data={data} />
        {data.state === 'failed' && <Button onClick={update}>{labels.welcome.tryAgain}</Button>}
      </section>
      <section className="flex w-full flex-col gap-3 text-left">
        <h2 className="font-heading text-base font-semibold">{labels.welcome.firstSteps}</h2>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
          {labels.welcome.steps.map(step => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
    </main>
  )
}
