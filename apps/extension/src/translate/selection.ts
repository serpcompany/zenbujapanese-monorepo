const selectedText = () => getSelection()?.toString() ?? ''

async function activeTabSelection(): Promise<string | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.id === undefined) return null
  const [frame] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: selectedText
  })
  return typeof frame?.result === 'string' ? frame.result.trim() : ''
}

export async function readSelection(): Promise<string | null> {
  const own = selectedText().trim()
  if (own) return own
  return activeTabSelection().catch(() => null)
}
