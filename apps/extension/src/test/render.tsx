import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

export type Rendered = { container: HTMLElement; unmount(): void }

export function render(node: ReactNode): Rendered {
  const container = document.body.appendChild(document.createElement('div'))
  let root: Root | undefined
  act(() => {
    root = createRoot(container)
    root.render(node)
  })
  return {
    container,
    unmount() {
      act(() => root?.unmount())
      container.remove()
    }
  }
}

export async function settle(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) {
    await act(() => new Promise<void>(resolve => setTimeout(resolve, 0)))
  }
}

export async function click(element: Element | null | undefined): Promise<void> {
  if (!(element instanceof HTMLElement)) throw new Error('Nothing to click.')
  act(() => element.click())
  await settle()
}

export function find(scope: ParentNode, selector: string): HTMLElement {
  const found = scope.querySelector(selector)
  if (!(found instanceof HTMLElement)) throw new Error(`Nothing matches ${selector}.`)
  return found
}

export function byText(scope: ParentNode, selector: string, text: string): HTMLElement {
  const found = [...scope.querySelectorAll(selector)].find(
    element => element.textContent?.trim() === text
  )
  if (!(found instanceof HTMLElement)) throw new Error(`No ${selector} says ${text}.`)
  return found
}

export const switchFor = (scope: ParentNode, setting: string) =>
  find(scope, `[role="switch"][data-setting="${setting}"]`)

export const isOn = (element: HTMLElement) => element.getAttribute('aria-checked') === 'true'
