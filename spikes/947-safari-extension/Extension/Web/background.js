const api = globalThis.browser ?? globalThis.chrome;

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const began = Date.now();
  api.runtime
    .sendNativeMessage('application.id', message)
    .then((answer) => sendResponse({ ...answer, roundTripMs: Date.now() - began }))
    .catch((error) => sendResponse({ error: String(error), roundTripMs: Date.now() - began }));
  return true;
});
