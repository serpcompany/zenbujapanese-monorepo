(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const japanese = /[぀-ヿ㐀-鿿]/;
  let scheme = null;
  let timer = null;
  let lastText = '';

  const host = document.createElement('div');
  host.id = 'zenbu-spike-host';
  host.style.all = 'initial';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      .popup { position: fixed; left: 8px; right: 8px; bottom: 8px; z-index: 2147483647;
        background: #fff; color: #111; border-radius: 14px; padding: 14px; font: 15px -apple-system, sans-serif;
        box-shadow: 0 4px 24px rgba(0,0,0,.3); max-height: 50vh; overflow: auto; }
      .popup[hidden] { display: none; }
      .head { font-size: 26px; font-weight: 600; }
      .reading { color: #555; }
      ol { padding-left: 20px; margin: 6px 0; }
      .actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
      button { font: 14px -apple-system, sans-serif; padding: 8px 10px; border-radius: 8px; border: 1px solid #ccc; background: #f5f5f5; color: #111; }
      .meta { font: 11px ui-monospace, monospace; color: #666; margin-top: 8px; white-space: pre-wrap; }
      .watch { position: absolute; z-index: 2147483646; padding: 8px 12px; border-radius: 18px; border: 0;
        background: #d32f2f; color: #fff; font: 600 14px -apple-system, sans-serif; }
    </style>
    <div class="popup" hidden role="dialog" aria-label="Word popup"></div>`;
  const popup = root.querySelector('.popup');
  (document.body ?? document.documentElement).appendChild(host);

  const ask = (message) => api.runtime.sendMessage(message);

  ask({ command: 'config' }).then((answer) => {
    scheme = answer?.scheme ?? null;
    placeWatchButtons();
  });

  const probeText = new URLSearchParams(location.search).get('probe');
  if (probeText) probe(probeText.split('|'));

  async function probe(texts) {
    const out = document.createElement('pre');
    out.id = 'probe';
    out.style.cssText = 'white-space:pre-wrap;font:11px ui-monospace,monospace';
    document.body.appendChild(out);
    for (const text of texts) {
      const answer = await ask({ command: 'lookUp', text });
      const m = answer?.memory ?? {};
      out.textContent += `PROBE ${text.length}ch ${text.slice(0, 12)} kind=${answer?.kind} native=${answer?.ms}ms rt=${answer?.roundTripMs}ms footprint=${m.footprintMB} peak=${m.peakMB} pid=${m.pid} answered=${m.answered}\n`;
    }
    out.textContent += 'PROBE done\n';
  }

  document.addEventListener('selectionchange', () => {
    clearTimeout(timer);
    timer = setTimeout(lookUpSelection, 450);
  });

  async function lookUpSelection() {
    const text = (document.getSelection()?.toString() ?? '').trim();
    if (!text || text === lastText || !japanese.test(text)) return;
    lastText = text;
    show(`<div class="reading">Looking up ${escape(text)}…</div>`);
    const answer = await ask({ command: 'lookUp', text });
    render(text, answer);
  }

  function render(text, answer) {
    const meta = `kind ${answer?.kind} · native ${answer?.ms} ms · round trip ${answer?.roundTripMs} ms\n` +
      `memory ${JSON.stringify(answer?.memory ?? answer?.error ?? {})}`;
    const word = answer?.word ?? answer?.words?.[0];
    if (!word) {
      show(`<div>No entry for ${escape(text)}</div><div class="meta">${escape(meta)}</div>`);
      return;
    }
    const others = (answer.words ?? []).slice(1).map((w) => escape(w.headword)).join('、');
    show(`
      <div class="head" lang="ja">${escape(word.headword)}</div>
      <div class="reading" lang="ja">${escape(word.reading)}</div>
      <ol>${word.meanings.map((m) => `<li>${escape(m)}</li>`).join('')}</ol>
      ${others ? `<div class="reading">Also: ${others}</div>` : ''}
      <div class="actions">
        <button data-act="pronounce">Pronounce</button>
        <button data-act="markKnown">Mark as Known</button>
        <button data-act="addToFavorites">Add to List</button>
        <button data-act="share">Share</button>
        <button data-act="open">Open in Zenbu</button>
        <button data-act="close">Close</button>
      </div>
      <div class="meta" id="meta">${escape(meta)}</div>`);
    popup.querySelectorAll('button').forEach((button) =>
      button.addEventListener('click', () => act(button.dataset.act, word)));
  }

  async function act(action, word) {
    const meta = popup.querySelector('#meta');
    if (action === 'close') { popup.hidden = true; return; }
    if (action === 'pronounce') {
      const speech = new SpeechSynthesisUtterance(word.reading);
      speech.lang = 'ja-JP';
      speechSynthesis.speak(speech);
      return;
    }
    if (action === 'share') {
      navigator.share?.({ text: word.headword, url: `https://zenbujapanese.com/dictionary/search/${encodeURIComponent(word.headword)}/` })
        .catch((error) => { meta.textContent += `\nshare: ${error}`; });
      return;
    }
    if (action === 'open') {
      openApp(`look-up?text=${encodeURIComponent(word.headword)}`);
      return;
    }
    const answer = await ask({ command: action, id: word.id, headword: word.headword, reading: word.reading });
    meta.textContent += `\n${action}: ${JSON.stringify(answer)}`;
  }

  function openApp(path) {
    if (!scheme) return;
    window.location.href = `${scheme}://${path}`;
  }

  function show(html) {
    popup.innerHTML = html;
    popup.hidden = false;
  }

  function videoID(src) {
    try {
      const url = new URL(src, location.href);
      const hostName = url.hostname.replace(/^www\.|^m\./, '');
      if (hostName === 'youtu.be') return url.pathname.slice(1) || null;
      if (!/^(youtube\.com|youtube-nocookie\.com)$/.test(hostName)) return null;
      if (url.pathname === '/watch') return url.searchParams.get('v');
      const parts = url.pathname.split('/').filter(Boolean);
      if (['embed', 'shorts', 'live'].includes(parts[0])) return parts[1] ?? null;
      return null;
    } catch {
      return null;
    }
  }

  function placeWatchButtons() {
    root.querySelectorAll('.watch').forEach((button) => button.remove());
    const targets = [];
    const own = videoID(location.href);
    if (own) targets.push({ id: own, rect: null });
    document.querySelectorAll('iframe[src]').forEach((frame) => {
      const id = videoID(frame.src);
      if (id) targets.push({ id, rect: frame.getBoundingClientRect() });
    });
    for (const { id, rect } of targets) {
      const button = document.createElement('button');
      button.className = 'watch';
      button.textContent = 'Watch in Zenbu';
      button.dataset.video = id;
      if (rect) {
        button.style.left = `${rect.left + window.scrollX + 8}px`;
        button.style.top = `${rect.top + window.scrollY + 8}px`;
      } else {
        button.style.position = 'fixed';
        button.style.right = '12px';
        button.style.top = '64px';
      }
      button.addEventListener('click', () => openApp(`watch?v=${encodeURIComponent(id)}`));
      root.appendChild(button);
    }
  }

  window.addEventListener('resize', placeWatchButtons);
  new MutationObserver(() => {
    clearTimeout(placeWatchButtons.timer);
    placeWatchButtons.timer = setTimeout(placeWatchButtons, 500);
  }).observe(document.documentElement, { childList: true, subtree: true });

  function escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  }
})();
