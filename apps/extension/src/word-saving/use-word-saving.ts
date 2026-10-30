import { useEffect } from 'react'
import type { CopyChange, WordState } from '../shared/account-copy'
import { useSaving } from './saving'

export type SavingWord = { item: string; headword: string; reading: string }

const hex = (bytes: Uint8Array) =>
  [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')

export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const id = hex(bytes)
  return [id.slice(0, 8), id.slice(8, 12), id.slice(12, 16), id.slice(16, 20), id.slice(20)].join(
    '-'
  )
}

const stateChange = (word: SavingWord, state: WordState): CopyChange =>
  state === 'unknown'
    ? { change: 'set', item: word.item, state }
    : { change: 'set', ...word, state }

export function useWordSaving(word: SavingWord) {
  const { port, views, refresh, show, focusNote } = useSaving()
  const { item, headword, reading } = word
  const view = views[item] ?? null
  useEffect(() => {
    void refresh(item)
    return port.onKnown(known => {
      if (known === null || item in known) void refresh(item)
    })
  }, [port, refresh, item])
  async function change(asked: CopyChange) {
    const answer = await port.change(item, asked)
    if (answer.type === 'refused' && answer.refusal !== 'invalid') show({ kind: answer.refusal })
    await refresh(item)
    return answer.type === 'changed'
  }
  async function setState(state: WordState) {
    const was = view?.state ?? 'unknown'
    if (!(await change(stateChange(word, state))) || state !== 'known' || was === 'known') return
    show({ kind: 'known', headword, undo: () => void change(stateChange(word, was)) })
  }
  const refused = () => {
    if (view?.refusal) show({ kind: view.refusal })
    return view?.refusal != null
  }
  return {
    view,
    refused,
    setState,
    choose: (list: string, holds: boolean) =>
      void change(
        holds
          ? { change: 'add-word', list, item, headword, reading }
          : { change: 'remove-word', list, item }
      ),
    newList: (name: string) =>
      void change({ change: 'add-word', list: newId(), item, headword, reading, name }),
    writeNote: (note: string, text: string) =>
      change(
        text.trim() === ''
          ? { change: 'delete-note', note }
          : { change: 'write-note', note, item, text, headword, reading }
      ),
    addNote: () => {
      if (refused()) return false
      focusNote(item)
      return true
    }
  }
}
