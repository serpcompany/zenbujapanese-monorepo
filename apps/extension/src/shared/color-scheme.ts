export type ColorSchemeQuery = {
  readonly matches: boolean
  addEventListener(type: 'change', listener: () => void): void
  removeEventListener(type: 'change', listener: () => void): void
}

export function systemDarkQuery(): ColorSchemeQuery {
  return matchMedia('(prefers-color-scheme: dark)')
}

export function followSystemColorScheme(
  element: Element,
  query: ColorSchemeQuery = systemDarkQuery()
): () => void {
  const apply = () => element.classList.toggle('dark', query.matches)
  apply()
  query.addEventListener('change', apply)
  return () => query.removeEventListener('change', apply)
}
