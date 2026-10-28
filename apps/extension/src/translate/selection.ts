import { isPageSelection, readPageSelection } from '../page-lookup/messages'

const selectedText = () => getSelection()?.toString() ?? ''

async function pageScriptSelection(tabId: number): Promise<string | null> {
  const answer: unknown = await chrome.tabs.sendMessage(tabId, readPageSelection).catch(() => null)
  return isPageSelection(answer) ? answer.selection : null
}

async function injectedSelection(tabId: number): Promise<string> {
  const [frame] = await chrome.scripting.executeScript({ target: { tabId }, func: selectedText })
  return typeof frame?.result === 'string' ? frame.result : ''
}

async function activeTabSelection(): Promise<string | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.id === undefined) return null
  const read = (await pageScriptSelection(tab.id)) ?? (await injectedSelection(tab.id))
  return read.trim()
}

export async function readSelection(): Promise<string | null> {
  const own = selectedText().trim()
  if (own) return own
  return activeTabSelection().catch(() => null)
}
