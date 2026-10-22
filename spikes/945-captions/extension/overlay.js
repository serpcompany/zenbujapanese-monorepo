globalThis.ZenbuOverlay = (() => {
  const { cueAt, translationFor } = globalThis.ZenbuCaptions;
  const speeds = [0.5, 0.75, 1, 1.25, 1.5];
  let panel;
  let logBox;
  let player;
  let cues = [];
  let translations = [];
  let index = -1;
  let repeat = false;
  let stopAt = null;
  let settleUntil = 0;
  const state = { site: location.hostname, status: 'starting', cueCount: 0, translationCount: 0 };
  let translator = null;
  const onDevice = new Map();

  async function startTranslator(fromClick) {
    if (translator || !('Translator' in self)) {
      if (!('Translator' in self)) log('on-device translator: Translator missing in this context');
      return;
    }
    const options = { sourceLanguage: 'ja', targetLanguage: 'en' };
    const availability = await Translator.availability(options);
    log('on-device translator availability', availability);
    if (availability !== 'available' && !fromClick) return;
    const started = performance.now();
    try {
      translator = await Translator.create(options);
      state.onDeviceReadyMs = Math.round(performance.now() - started);
      log('on-device translator ready in ms', String(state.onDeviceReadyMs));
    } catch (error) {
      log('on-device translator failed', String(error));
    }
  }

  function onDeviceTranslation(i) {
    if (!translator || !cues[i]) return '';
    if (!onDevice.has(i)) {
      onDevice.set(i, '');
      const started = performance.now();
      translator.translate(cues[i].text).then((text) => {
        onDevice.set(i, text);
        state.onDeviceLastMs = Math.round(performance.now() - started);
      });
    }
    return onDevice.get(i);
  }

  function log(...parts) {
    const line = parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ');
    console.log('[zenbu-spike]', line);
    if (logBox) {
      const row = document.createElement('div');
      row.textContent = line;
      logBox.prepend(row);
      while (logBox.childElementCount > 14) logBox.lastChild.remove();
    }
  }

  function button(label, action) {
    const b = document.createElement('button');
    b.textContent = label;
    b.dataset.action = action;
    b.style.cssText = 'margin:2px;padding:2px 6px;font:12px system-ui;cursor:pointer';
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      run({ action });
    });
    return b;
  }

  function mount() {
    if (panel) return;
    panel = document.createElement('div');
    panel.id = 'zenbu-spike';
    panel.style.cssText =
      'position:fixed;right:12px;top:72px;z-index:2147483647;width:420px;max-height:80vh;overflow:auto;' +
      'background:rgba(20,20,20,.92);color:#fff;font:13px system-ui;padding:10px;border-radius:8px;';
    panel.innerHTML =
      '<div style="font-weight:600">[zenbu-spike] #945</div>' +
      '<div data-role="status" style="opacity:.7"></div>' +
      '<div data-role="lines" style="margin:6px 0"></div>' +
      '<div data-role="controls"></div>' +
      '<div data-role="log" style="font:11px ui-monospace,monospace;opacity:.8;margin-top:6px;white-space:pre-wrap"></div>';
    const controls = panel.querySelector('[data-role=controls]');
    controls.append(button('◀ line', 'previous'), button('⏯', 'toggle'), button('line ▶', 'next'), button('repeat', 'repeat'));
    for (const speed of speeds) controls.append(button(`${speed}×`, `speed:${speed}`));
    const translate = button('on-device en', 'translator');
    controls.append(translate);
    logBox = panel.querySelector('[data-role=log]');
    document.documentElement.append(panel);
  }

  function render() {
    if (!panel) return;
    state.index = index;
    state.time = player?.time() ?? null;
    state.paused = player?.video()?.paused ?? null;
    state.rate = player?.video()?.playbackRate ?? null;
    state.repeat = repeat;
    state.text = cues[index]?.text ?? '';
    state.translation = translationFor(translations, cues[index]);
    state.translationFrom = state.translation ? 'track' : null;
    if (!state.translation && translations.length === 0) {
      state.translation = onDeviceTranslation(index);
      if (state.translation) state.translationFrom = 'on-device';
    }
    panel.dataset.state = JSON.stringify(state);
    panel.querySelector('[data-role=status]').textContent =
      `${state.status} · ${cues.length} lines · ${translations.length} en · t=${state.time?.toFixed(1)} · ${state.rate}× ${repeat ? '· repeat' : ''}`;
    const lines = panel.querySelector('[data-role=lines]');
    lines.replaceChildren(
      ...[-1, 0, 1].map((offset) => {
        const cue = cues[index + offset];
        const div = document.createElement('div');
        div.style.cssText = offset === 0 ? 'font-size:18px;color:#ffd54a' : 'opacity:.5';
        div.textContent = cue ? cue.text : '';
        if (offset === 0) {
          const en = document.createElement('div');
          en.style.cssText = 'font-size:13px;color:#9fd';
          en.textContent = state.translation;
          div.append(en);
        }
        return div;
      })
    );
  }

  function tick() {
    if (!player || cues.length === 0) return render();
    const time = player.time();
    const cue = cues[index];
    if (repeat && cue && time >= cue.end && Date.now() > settleUntil) {
      settleUntil = Date.now() + 700;
      player.seek(cue.start + 0.01);
      log(`repeat: back to ${cue.start.toFixed(2)}s`);
      return render();
    }
    if (repeat && Date.now() <= settleUntil) return render();
    if (stopAt !== null && time >= stopAt) {
      stopAt = null;
      player.pause();
    }
    const next = cueAt(cues, time);
    if (next !== index) {
      index = next;
      if (cues[index] && time < cues[index].end) log(`line ${index} @${time.toFixed(2)}s:`, cues[index].text);
    }
    render();
  }

  function goTo(target) {
    const cue = cues[Math.max(0, Math.min(cues.length - 1, target))];
    if (!cue) return;
    const wasPaused = player.video().paused;
    player.seek(cue.start + 0.01);
    index = cue.id;
    if (wasPaused && !repeat) {
      stopAt = cue.end;
      player.play();
    }
    setTimeout(() => log(`seek result: asked ${cue.start.toFixed(2)}s, now ${player.time().toFixed(2)}s`), 800);
  }

  function run(command) {
    const action = command.action;
    if (action === 'translator') return startTranslator(true);
    if (!player) return log('no player yet');
    log('command', action);
    if (action === 'previous') goTo(index - 1);
    else if (action === 'next') goTo(index + 1);
    else if (action === 'repeat') {
      repeat = !repeat;
      log('repeat', repeat);
    } else if (action === 'toggle' || action === 'pause' || action === 'play') {
      const paused = player.video().paused;
      if ((action === 'toggle' && paused) || action === 'play') player.play();
      else player.pause();
      setTimeout(() => log('pause result: paused =', String(player.video().paused)), 500);
    } else if (action.startsWith('speed:')) {
      player.setRate(Number(action.slice(6)));
      setTimeout(() => log('speed result: playbackRate =', String(player.video().playbackRate)), 500);
    } else if (action === 'seekTo') {
      player.seek(command.time);
      setTimeout(() => log(`seek result: asked ${command.time}s, now ${player.time().toFixed(2)}s`), 800);
    }
  }

  document.addEventListener('zenbu-spike:cmd', (e) => {
    try {
      run(JSON.parse(e.detail));
    } catch (error) {
      log('bad command', String(error));
    }
  });

  setInterval(tick, 100);

  return {
    mount,
    log,
    state,
    setPlayer(p) {
      player = p;
    },
    setCues(next, nextTranslations) {
      cues = next;
      translations = nextTranslations ?? [];
      onDevice.clear();
      index = -1;
      if (cues.length && translations.length === 0) startTranslator(false);
      state.cueCount = cues.length;
      state.translationCount = translations.length;
    },
    setStatus(status) {
      state.status = status;
      log('status', status);
    },
  };
})();
