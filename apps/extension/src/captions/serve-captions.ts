import { failure } from '../shared/messages'
import { readSettings, watchSettings } from '../shared/settings'
import { watchedVideoId } from '../video/watch-page'
import { type CaptionsService, captionsService } from './captions-service'
import { type CaptionsAnswer, isCaptionsEnvelope } from './messages'
import { youTubeiURL } from './youtube-requests'

type Sender = { tab?: { id?: number } }

type Rule = chrome.declarativeNetRequest.Rule

const originRuleId = 1

const ignore = () => undefined

export function answerCaptions(service: Pick<CaptionsService, 'answer'>) {
  return (
    message: unknown,
    sender: Sender,
    sendResponse: (answer: CaptionsAnswer) => void
  ): boolean => {
    if (!isCaptionsEnvelope(message)) return false
    service
      .answer(message.captions, sender.tab?.id)
      .then(sendResponse, (error: unknown) => sendResponse(failure(error)))
    return true
  }
}

export function originRule(extensionId: string): Rule {
  return {
    id: originRuleId,
    priority: 1,
    action: {
      type: 'modifyHeaders' as Rule['action']['type'],
      requestHeaders: [
        { header: 'origin', operation: 'remove' as chrome.declarativeNetRequest.HeaderOperation }
      ]
    },
    condition: {
      urlFilter: `|${youTubeiURL}`,
      initiatorDomains: [extensionId],
      resourceTypes: ['xmlhttprequest' as chrome.declarativeNetRequest.ResourceType]
    }
  }
}

export function serveCaptions(): void {
  const originRemoved = chrome.declarativeNetRequest
    .updateSessionRules({
      removeRuleIds: [originRuleId],
      addRules: [originRule(chrome.runtime.id)]
    })
    .catch(ignore)
  const service = captionsService({
    storage: chrome.storage.session,
    fetch: (url, init) => originRemoved.then(() => fetch(url, init)),
    tabVideo: tabId =>
      chrome.tabs.get(tabId).then(
        tab => watchedVideoId(tab.url),
        () => null
      ),
    captionsOn: () => readSettings().then(settings => settings['videos.zenbuCaptions']),
    announce: change => {
      chrome.runtime.sendMessage(change).catch(ignore)
      chrome.tabs.sendMessage(change.tabId, change).catch(ignore)
    },
    now: Date.now,
    random: Math.random
  })
  chrome.runtime.onMessage.addListener(answerCaptions(service))
  chrome.tabs.onRemoved.addListener(tabId => {
    service.tabClosed(tabId)
  })
  watchSettings(settings => {
    if (settings['videos.zenbuCaptions']) service.openVideosAgain().catch(ignore)
  })
}
