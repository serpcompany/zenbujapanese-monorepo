'use client'

import { toast } from 'sonner'

export function showUnsupported(message: string) {
  toast.error(message)
}

export function reloadPage() {
  window.location.reload()
}
