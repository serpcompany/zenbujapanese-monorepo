import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

export const here = dirname(fileURLToPath(import.meta.url));
export const worktree = resolve(here, '../..');
export const out = join(worktree, 'tmp/agent/verify/945');
mkdirSync(out, { recursive: true });

const chromes = {
  cft: join(homedir(), '.cache/puppeteer/chrome/mac_arm-153.0.8010.36/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
  branded: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
};

export async function launch(kind, extraArgs = []) {
  const browser = await puppeteer.launch({
    executablePath: chromes[kind],
    headless: process.env.HEADFUL ? false : true,
    pipe: true,
    enableExtensions: true,
    userDataDir: join(worktree, `tmp/agent/profile-${kind}-${Date.now()}`),
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--window-size=1280,900', '--lang=en-US', ...extraArgs],
  });
  const extensionId = await browser.installExtension(join(here, 'extension'));
  return { browser, extensionId, version: await browser.version() };
}
