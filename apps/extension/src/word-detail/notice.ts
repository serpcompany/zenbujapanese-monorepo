import { toast } from 'sonner'
import { wordDetailLabels } from './labels'

export function notify(message: string) {
  toast(message)
}

export async function copyText(text: string, copied: string) {
  try {
    await navigator.clipboard.writeText(text)
    notify(copied)
  } catch {
    notify(wordDetailLabels.copyFailed)
  }
}
