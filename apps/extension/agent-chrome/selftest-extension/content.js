console.log('[selftest] content script on', location.href)
const button = document.createElement('button')
button.id = 'selftest-button'
button.textContent = 'self-test'
button.style.cssText = 'position:fixed;top:8px;left:8px;z-index:2147483647'
button.onclick = () =>
  chrome.runtime
    .sendMessage({ from: 'content' })
    .then(() => console.log('[selftest] content click answered'))
document.body.prepend(button)
