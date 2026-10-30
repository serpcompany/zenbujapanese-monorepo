import { useEffect, useState } from 'react'
import { askKnown, onKnownChanged } from '../src/shared/account-copy'

const knownItems = ['d12d09f1107aef0f7d43b54b62f0b7e1', 'kanji:要']

export function KnownStates() {
  const [known, setKnown] = useState<Record<string, boolean>>({})
  useEffect(() => {
    let live = true
    const ask = () =>
      void askKnown(knownItems).then(answer => {
        if (live) setKnown(answer)
      })
    ask()
    const stop = onKnownChanged(changed => {
      if (changed === null) ask()
      else setKnown(held => ({ ...held, ...changed }))
    })
    return () => {
      live = false
      stop()
    }
  }, [])
  return (
    <ul data-test="known-states" className="m-4 flex flex-col gap-1 text-sm">
      {knownItems.map(item => (
        <li key={item} data-known-item={item} data-known={known[item] === true}>
          {item}: {known[item] ? 'known' : 'not known'}
        </li>
      ))}
    </ul>
  )
}
