fetch('http://localhost:8790/v1/auth/sign-in/nonce', { method: 'POST', headers: { 'content-type': 'application/json', 'x-zenbu-client': 'zenbu-extension' }, body: '{}' })
  .then(r => r.status, e => 'failed: ' + e)
  .then(result => { document.documentElement.dataset.contentScriptFetch = String(result) })
