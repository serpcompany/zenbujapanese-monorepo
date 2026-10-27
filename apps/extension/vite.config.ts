import { defineConfig } from 'vite'
import { extensionConfig } from './build/extension-config.ts'
import { environmentFrom, environmentSetting } from './build/hosts.ts'

export default defineConfig(({ mode }) =>
  extensionConfig(
    mode === 'test' ? 'test' : 'release',
    environmentFrom(process.env[environmentSetting])
  )
)
