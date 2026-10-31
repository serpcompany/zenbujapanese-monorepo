import { aidAttribute } from './walker'

const added = `rt, rp, [${aidAttribute}="romaji"], [${aidAttribute}="meaning"]`

export function selectedPageText(selection: Selection | null): string {
  if (!selection || selection.rangeCount === 0) return ''
  const whole = selection.toString()
  const parts: string[] = []
  for (let index = 0; index < selection.rangeCount; index += 1) {
    const fragment = selection.getRangeAt(index).cloneContents()
    const aids = fragment.querySelectorAll(added)
    if (aids.length === 0) return whole
    for (const aid of aids) aid.remove()
    parts.push(fragment.textContent ?? '')
  }
  return parts.join('\n')
}
