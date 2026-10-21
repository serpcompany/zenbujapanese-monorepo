const special = /[\\^$.+()[\]|]/g

function expandBraces(pattern: string): string[] {
  const found = /\{([^{}]*)\}/.exec(pattern)
  if (!found) return [pattern]
  const before = pattern.slice(0, found.index)
  const after = pattern.slice(found.index + found[0].length)
  return found[1].split(',').flatMap(option => expandBraces(`${before}${option}${after}`))
}

function globSource(pattern: string): string {
  const segments = pattern.split('/')
  return segments
    .map((segment, index) => {
      const last = index === segments.length - 1
      if (segment === '**') return last ? '.*' : '(?:.*/)?'
      const source = segment
        .replace(special, '\\$&')
        .replaceAll('*', '[^/]*')
        .replaceAll('?', '[^/]')
      return `${source}${last ? '' : '/'}`
    })
    .join('')
}

const compiled = new Map<string, RegExp>()

export function matchesGlob(pattern: string, path: string): boolean {
  let expression = compiled.get(pattern)
  if (!expression) {
    expression = new RegExp(`^(?:${expandBraces(pattern).map(globSource).join('|')})$`)
    compiled.set(pattern, expression)
  }
  return expression.test(path)
}
