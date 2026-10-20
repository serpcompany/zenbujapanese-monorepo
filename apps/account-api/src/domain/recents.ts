export const recentLimits = { kept: 50, goneKept: 100 } as const

interface Bounded<T> {
  count(): Promise<number>
  oldest(): Promise<T | null>
  prune(oldest: T): Promise<void>
  forget(kept: number): Promise<void>
}

export async function keepTheNewest<T>(bounded: Bounded<T>) {
  while ((await bounded.count()) > recentLimits.kept) {
    const oldest = await bounded.oldest()
    if (!oldest) break
    await bounded.prune(oldest)
  }
  await bounded.forget(recentLimits.goneKept)
}
