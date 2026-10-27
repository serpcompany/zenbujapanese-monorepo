import { sourceCredits } from '@zenbu/dictionary-core/sources/credits'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
import { Credits, extensionCredits } from './credits'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

it('names every source the core credits for the extension, and no other', async () => {
  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  await act(async () => root.render(<Credits />))
  const shown = [...container.querySelectorAll('[data-credits] li a:first-child')].map(
    link => link.textContent
  )
  const credited = Object.values(sourceCredits)
    .filter(source => (source.clients as readonly string[]).includes('extension'))
    .map(source => source.name)
  expect(shown).toEqual(credited)
  expect(extensionCredits.credits.map(source => source.name)).toEqual(credited)
  expect(container.textContent).toContain(extensionCredits.conversionNotice)
  act(() => root.unmount())
})
