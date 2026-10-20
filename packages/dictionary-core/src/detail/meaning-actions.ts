export interface MeaningActions {
  spoken: string
  glosses: string[]
  copyText: string
}

export function meaningActions(sense: {
  meaning: string
  glosses: readonly string[]
  noteText: string | null
}): MeaningActions {
  const glosses = [...new Set(sense.glosses.map(spokenGloss))].filter(Boolean)
  return {
    spoken: glosses.length > 0 ? glosses.join(', ') : collapsed(sense.meaning),
    glosses,
    copyText: sense.noteText ? `${sense.meaning}\n${sense.noteText}` : sense.meaning
  }
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
