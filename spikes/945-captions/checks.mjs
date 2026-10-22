export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function state(page) {
  return page.evaluate(() => JSON.parse(document.getElementById('zenbu-spike')?.dataset.state ?? 'null'));
}

export async function cmd(page, command) {
  await page.evaluate((c) => document.dispatchEvent(new CustomEvent('zenbu-spike:cmd', { detail: JSON.stringify(c) })), command);
}

export async function waitState(page, check, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const s = await state(page).catch(() => null);
    if (s && check(s)) return s;
    await sleep(200);
  }
  return state(page).catch(() => null);
}

export async function exerciseControls(page, seekTarget = 30) {
  const checks = {};
  await cmd(page, { action: 'play' });
  await sleep(1500);
  await cmd(page, { action: 'seekTo', time: seekTarget });
  await sleep(1500);
  let s = await state(page);
  checks.seekTo = { asked: seekTarget, time: s.time, index: s.index, text: s.text, translation: s.translation };
  const before = s.index;
  await cmd(page, { action: 'next' });
  await sleep(1200);
  s = await state(page);
  checks.next = { from: before, to: s.index, time: s.time, text: s.text };
  await cmd(page, { action: 'previous' });
  await sleep(1200);
  s = await state(page);
  checks.previous = { to: s.index, time: s.time, text: s.text };
  await cmd(page, { action: 'pause' });
  await sleep(800);
  s = await state(page);
  const t1 = s.time;
  await sleep(1000);
  s = await state(page);
  checks.pause = { paused: s.paused, timeMovedWhilePaused: +(s.time - t1).toFixed(3) };
  await cmd(page, { action: 'play' });
  await sleep(800);
  for (const speed of [0.5, 1.5, 1]) {
    await cmd(page, { action: `speed:${speed}` });
    await sleep(600);
    const a = await state(page);
    await sleep(2000);
    const b = await state(page);
    checks[`speed${speed}`] = { rate: b.rate, mediaSecondsPer2s: +(b.time - a.time).toFixed(2) };
  }
  await cmd(page, { action: 'repeat' });
  s = await state(page);
  const cue = { index: s.index, text: s.text };
  await sleep(9000);
  const r = await state(page);
  checks.repeat = { startIndex: cue.index, indexAfter9s: r.index, stillOnLine: r.index === cue.index, text: cue.text };
  await cmd(page, { action: 'repeat' });
  return checks;
}
