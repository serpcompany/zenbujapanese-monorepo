export interface MeaningActions {
  spoken: string
  glosses: string[]
  copyText: string
}

export function meaningActions(sense: {
  meaning: string
  noteText: string | null
}): MeaningActions {
  const glosses = [...new Set(meaningGlosses(sense.meaning).map(spokenGloss))].filter(Boolean)
  return {
    spoken: glosses.length > 0 ? glosses.join(', ') : collapsed(sense.meaning),
    glosses,
    copyText: sense.noteText ? `${sense.meaning}\n${sense.noteText}` : sense.meaning
  }
}

export function meaningGlosses(meaning: string): string[] {
  const glosses: string[] = []
  let depth = 0
  let start = 0
  for (let index = 0; index < meaning.length; index++) {
    const character = meaning[index]
    if (character === '(') depth++
    else if (character === ')') depth = Math.max(0, depth - 1)
    else if (character === ',' && depth === 0) {
      glosses.push(meaning.slice(start, index))
      start = index + 1
    }
  }
  glosses.push(meaning.slice(start))
  return glosses.map(collapsed).filter(Boolean)
}

export function spokenGloss(gloss: string): string {
  let text = collapsed(gloss)
  for (let opening = endingGroupStart(text); opening > 0; opening = endingGroupStart(text)) {
    text = text.slice(0, opening).trimEnd()
  }
  return collapsed(text.replace(/[()]/gu, ''))
}

function endingGroupStart(text: string): number {
  if (!text.endsWith(')')) return -1
  let depth = 0
  for (let index = text.length - 1; index >= 0; index--) {
    if (text[index] === ')') depth++
    else if (text[index] === '(' && --depth === 0) return index
  }
  return -1
}

function collapsed(text: string): string {
  return text.replace(/\s+/gu, ' ').trim()
}
