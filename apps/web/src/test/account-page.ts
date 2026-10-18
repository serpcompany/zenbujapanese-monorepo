import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { vi } from 'vitest'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

export const apiUrl = 'https://api.example.com'

export interface ServiceCall {
  route: string
  credentials: RequestCredentials | undefined
  authorization: string | undefined
  body: Record<string, unknown> | undefined
}

type Answer = Response | ((call: ServiceCall) => Response | Promise<Response>)

export const answer = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  })

export const refusal = (status: number, code: string, extra: Record<string, unknown> = {}) =>
  answer({ error: { code, message: code }, ...extra }, status)

export function stubAccountService(routes: Record<string, Answer | Answer[]>) {
  const calls: ServiceCall[] = []
  const queues = new Map(
    Object.entries(routes).map(([route, given]) => [route, Array.isArray(given) ? given : [given]])
  )
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const headers = (init.headers ?? {}) as Record<string, string>
      const call: ServiceCall = {
        route: `${init.method ?? 'GET'} ${url.replace(apiUrl, '')}`,
        credentials: init.credentials,
        authorization: headers.authorization,
        body: init.body === undefined ? undefined : JSON.parse(String(init.body))
      }
      calls.push(call)
      const queue = queues.get(call.route) ?? []
      const next = queue.length > 1 ? queue.shift() : queue[0]
      if (!next) throw new TypeError(`No stub for ${call.route}`)
      return typeof next === 'function' ? next(call) : next.clone()
    })
  )
  return { calls, routes: () => calls.map(call => call.route) }
}

let root: Root | null = null

export function render(element: ReactElement): HTMLElement {
  document.body.innerHTML = '<div id="root"></div>'
  const container = document.getElementById('root') as HTMLElement
  root = createRoot(container)
  act(() => root?.render(element))
  return container
}

export function unmount() {
  act(() => root?.unmount())
  root = null
  document.body.replaceChildren()
  vi.unstubAllGlobals()
}

export const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 0)))

export async function shows(container: HTMLElement, text: string) {
  await vi.waitFor(async () => {
    await settle()
    if (!container.textContent?.includes(text)) {
      throw new Error(`Not shown: ${text}\n\nShown: ${container.textContent}`)
    }
  })
}

function button(container: HTMLElement, name: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(
    candidate =>
      candidate.getAttribute('aria-label') === name || candidate.textContent?.trim() === name
  )
  if (!found) throw new Error(`No button named ${name}`)
  return found
}

export async function click(container: HTMLElement, name: string) {
  await act(async () => button(container, name).click())
  await settle()
}

export async function fill(container: HTMLElement, label: string, value: string) {
  const labelled = [...container.querySelectorAll('label')].find(
    candidate => candidate.textContent?.trim() === label
  )
  const input = labelled
    ? container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[id="${labelled.htmlFor}"]`)
    : null
  if (!input) throw new Error(`No field labelled ${label}`)
  const setValue = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set
  await act(async () => {
    setValue?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

export async function submit(container: HTMLElement, name: string) {
  const form = button(container, name).closest('form')
  if (!form) throw new Error(`${name} is in no form`)
  await act(async () => form.requestSubmit())
  await settle()
}
