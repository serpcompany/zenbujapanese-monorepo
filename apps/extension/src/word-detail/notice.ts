import { toast } from 'sonner'
import { wordDetailLabels } from './labels'

export function notify(message: string, clearWhen?: (clear: () => void) => void) {
  const shown = toast(message)
  clearWhen?.(() => toast.dismiss(shown))
}

export async function copyText(text: string, copied: string) {
  try {
    await navigator.clipboard.writeText(text)
    notify(copied)
  } catch {
    notify(wordDetailLabels.copyFailed)
  }
}
