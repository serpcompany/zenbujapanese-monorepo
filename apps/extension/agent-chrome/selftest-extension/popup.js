console.log('[selftest] popup page loaded')
document.getElementById('popup-button').onclick = () =>
  chrome.runtime
    .sendMessage({ from: 'popup' })
    .then(() => console.log('[selftest] popup click answered'))
