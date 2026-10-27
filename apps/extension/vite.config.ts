import { defineConfig } from 'vite'
import { extensionConfig } from './build/extension-config.ts'

export default defineConfig(({ mode }) => extensionConfig(mode === 'test' ? 'test' : 'release'))
