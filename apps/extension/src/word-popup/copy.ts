export type Sharing = {
  share?: (data: ShareData) => Promise<void>
  writeText?: (text: string) => Promise<void>
}

function copiedByCommand(text: string, root: Node): boolean {
  const owner = root.ownerDocument ?? document
  const area = owner.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  const parent = root.nodeType === Node.DOCUMENT_NODE ? owner.body : root
  parent.appendChild(area)
  area.select()
  try {
    return owner.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
  }
}

export async function copyText(text: string, root: Node, sharing?: Sharing): Promise<boolean> {
  const writeText = sharing?.writeText ?? navigator.clipboard?.writeText.bind(navigator.clipboard)
  if (writeText) {
    try {
      await writeText(text)
      return true
    } catch {}
  }
  return copiedByCommand(text, root)
}
