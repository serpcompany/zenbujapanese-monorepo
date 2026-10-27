import { homedir } from 'node:os'
import { join } from 'node:path'

export const here = import.meta.dirname
export const extensionRoot = join(here, '..')
export const checkout = join(here, '..', '..', '..')
const workDir = join(checkout, 'tmp', 'agent', 'agent-chrome')
export const logDir = join(workDir, 'logs')
export const consoleLog = join(logDir, 'console.log')
export const daemonLog = join(logDir, 'daemon.log')
export const freshProfiles = join(workDir, 'profiles')
export const stateDir =
  process.env.AGENT_CHROME_STATE_DIR ??
  join(homedir(), 'Library', 'Caches', 'com.zenbujapanese.agent-chrome')
export const statePath = join(stateDir, 'state.json')
export const lockPath = join(stateDir, 'lock')
export const youtubeLedgerPath = join(stateDir, 'youtube-requests.json')
export const persistentProfile = join(
  homedir(),
  'Library',
  'Application Support',
  'Zenbu Agent Chrome'
)
export const devtoolsPort = Number(process.env.AGENT_CHROME_DEVTOOLS_PORT ?? 9339)
export const controlPort = Number(process.env.AGENT_CHROME_CONTROL_PORT ?? 9340)
export const selftestExtension = join(here, 'selftest-extension')
export const standInSite = join(here, 'site')
export const verifyRoot = join(checkout, 'tmp', 'agent', 'verify')
