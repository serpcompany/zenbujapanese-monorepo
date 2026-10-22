const originRule = {
  id: 1,
  priority: 1,
  action: { type: 'modifyHeaders', requestHeaders: [{ header: 'origin', operation: 'remove' }] },
  condition: { urlFilter: '||www.youtube.com/youtubei/', tabIds: [chrome.tabs.TAB_ID_NONE], resourceTypes: ['xmlhttprequest'] },
};
const rulesReady = chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [1], addRules: [originRule] });

async function timed(promise) {
  const start = performance.now();
  const value = await promise;
  return { value, ms: Math.round(performance.now() - start) };
}

async function fetchText(url) {
  try {
    const { value: response, ms } = await timed(fetch(url));
    const text = await response.text();
    return { status: response.status, length: text.length, text, ms };
  } catch (error) {
    return { status: 0, length: 0, text: '', error: String(error) };
  }
}

function timedTextUrl(baseUrl, params) {
  const url = new URL(baseUrl, 'https://www.youtube.com');
  url.searchParams.delete('fmt');
  url.searchParams.delete('tlang');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

async function youTubeAndroid(videoId) {
  await rulesReady;
  const started = performance.now();
  const { value: response, ms: playerMs } = await timed(
    fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38', hl: 'en' } },
        videoId,
      }),
    })
  );
  const json = await response.json().catch(() => null);
  const tracks = (json?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []).map((t) => ({
    languageCode: t.languageCode,
    kind: t.kind ?? '',
    isTranslatable: !!t.isTranslatable,
    url: t.baseUrl,
  }));
  const result = {
    route: 'android',
    playerStatus: response.status,
    playability: json?.playabilityStatus?.status ?? null,
    title: json?.videoDetails?.title ?? null,
    playerMs,
    tracks: tracks.map(({ url, ...rest }) => rest),
  };
  const japanese = tracks.filter((t) => t.languageCode === 'ja' || t.languageCode.startsWith('ja-'));
  const track = japanese.find((t) => t.kind !== 'asr') ?? japanese[0];
  if (track) {
    result.chosen = { languageCode: track.languageCode, kind: track.kind || 'creator' };
    result.ja = await fetchText(timedTextUrl(track.url, { fmt: 'json3' }));
    if (track.isTranslatable) result.en = await fetchText(timedTextUrl(track.url, { fmt: 'json3', tlang: 'en' }));
  }
  result.totalMs = Math.round(performance.now() - started);
  return result;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'yt-android') {
    youTubeAndroid(message.videoId).then(sendResponse, (error) => sendResponse({ error: String(error) }));
    return true;
  }
  if (message?.type === 'fetch-text') {
    fetchText(message.url).then(sendResponse);
    return true;
  }
  return false;
});
