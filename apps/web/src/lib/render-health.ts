import { AsyncLocalStorage } from 'node:async_hooks'

interface RenderHealth {
  incomplete: boolean
}

const sharedKey = Symbol.for('zenbujapanese.render-health')
const shared = globalThis as typeof globalThis & {
  [sharedKey]?: AsyncLocalStorage<RenderHealth>
}
shared[sharedKey] ??= new AsyncLocalStorage<RenderHealth>()
const renders = shared[sharedKey]

export function markRenderIncomplete(): void {
  const health = renders.getStore()
  if (health) health.incomplete = true
}

export function watchedRender<T>(render: () => Promise<T>) {
  const health: RenderHealth = { incomplete: false }
  return { result: renders.run(health, render), incomplete: () => health.incomplete }
}
