globalThis.ZenbuCaptions = (() => {
  const soundTag = /\s*[\[［][^\]］]*[\]］]\s*/g;

  function clean(text, joiner) {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join(joiner)
      .replace(soundTag, ' ')
      .trim();
  }

  function finish(lines, joiner) {
    const cues = [];
    lines.sort((a, b) => a.start - b.start);
    lines.forEach((line, index) => {
      const text = clean(line.text, joiner);
      if (!text) return;
      const next = lines[index + 1]?.start ?? Infinity;
      const end = Math.max(line.start, Math.min(line.end, next));
      cues.push({ id: cues.length, start: line.start, end, text });
    });
    return cues;
  }

  function fromJson3(text, joiner = '') {
    const json = JSON.parse(text);
    const lines = (json.events ?? [])
      .filter((event) => Array.isArray(event.segs))
      .map((event) => ({
        start: event.tStartMs / 1000,
        end: (event.tStartMs + (event.dDurationMs ?? 0)) / 1000,
        text: event.segs.map((seg) => seg.utf8 ?? '').join(''),
      }));
    return finish(lines, joiner);
  }

  function ttmlTime(value, tickRate) {
    if (!value) return 0;
    if (value.endsWith('t')) return Number(value.slice(0, -1)) / tickRate;
    if (value.endsWith('ms')) return Number(value.slice(0, -2)) / 1000;
    if (value.endsWith('s')) return Number(value.slice(0, -1));
    const [h, m, s] = value.split(':');
    return Number(h) * 3600 + Number(m) * 60 + Number(s);
  }

  function ttmlText(node) {
    let text = '';
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) text += child.nodeValue;
      else if (child.localName === 'br') text += '\n';
      else if (child.getAttribute?.('tts:ruby') === 'text') continue;
      else if (child.getAttributeNS?.('http://www.w3.org/ns/ttml#styling', 'ruby') === 'text') continue;
      else text += ttmlText(child);
    }
    return text;
  }

  function fromTtml(text, joiner = '') {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const root = doc.documentElement;
    const tickRate = Number(
      root.getAttribute('ttp:tickRate') ??
        root.getAttributeNS('http://www.w3.org/ns/ttml#parameter', 'tickRate') ??
        10000000
    );
    const lines = [...doc.getElementsByTagNameNS('*', 'p')].map((p) => ({
      start: ttmlTime(p.getAttribute('begin'), tickRate),
      end: ttmlTime(p.getAttribute('end'), tickRate),
      text: ttmlText(p),
    }));
    return finish(lines, joiner);
  }

  function japaneseTrack(tracks) {
    const japanese = tracks.filter((t) => t.languageCode === 'ja' || t.languageCode?.startsWith('ja-'));
    return japanese.find((t) => t.kind !== 'asr') ?? japanese[0];
  }

  function cueAt(cues, time) {
    let low = 0;
    let high = cues.length - 1;
    let found = -1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (cues[mid].start <= time) {
        found = mid;
        low = mid + 1;
      } else high = mid - 1;
    }
    return found;
  }

  function translationFor(translations, cue) {
    if (!cue) return '';
    return translations
      .filter((t) => Math.min(t.end, cue.end) - Math.max(t.start, cue.start) > 0)
      .map((t) => t.text)
      .join(' ');
  }

  return { fromJson3, fromTtml, japaneseTrack, cueAt, translationFor, clean };
})();
